const CJ_ENDPOINT = "https://ads.api.cj.com/query";
const CJ_COMPANY_ID = "2543313";
const CJ_ADVERTISER_ID = "5840172";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanKeywords(value = "") {
  return String(value)
    .replace(/[^a-zA-Z0-9\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

function zipCodes(value = "") {
  return [...new Set(
    (String(value).match(/\b\d{5}(?:-\d{4})?\b/g) || [])
      .map((zip) => zip.slice(0, 5))
  )];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "DealPipe-CJ-Worker",
        cj_endpoint: CJ_ENDPOINT,
      });
    }

    if (url.pathname !== "/test") {
      return json({
        ok: false,
        error: "Not found",
        endpoints: ["/health", "/test?city=Waukesha&state=WI&zip=53186"],
      }, 404);
    }

    if (!env.CJ_API_TOKEN) {
      return json({ ok: false, error: "CJ_API_TOKEN secret is not configured" }, 500);
    }

    if (!env.TEST_SECRET) {
      return json({ ok: false, error: "TEST_SECRET secret is not configured" }, 500);
    }

    const suppliedSecret = request.headers.get("x-test-secret") || "";
    if (suppliedSecret !== env.TEST_SECRET) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const city = (url.searchParams.get("city") || "Waukesha").trim();
    const state = (url.searchParams.get("state") || "WI").trim();
    const zip = (url.searchParams.get("zip") || "53186").trim().slice(0, 5);

    if (!/^\d{5}$/.test(zip)) {
      return json({ ok: false, error: "zip must be a 5-digit US ZIP code" }, 400);
    }

    const keywords = cleanKeywords(`${city} ${state}`);
    const query = `query {
      products(
        companyId: "${CJ_COMPANY_ID}"
        partnerIds: ["${CJ_ADVERTISER_ID}"]
        keywords: ${JSON.stringify(keywords)}
        limit: 10
      ) {
        resultList {
          adId
          advertiserId
          advertiserName
          catalogId
          catalogName
          customLabel0
          customLabel1
          customLabel3
          description
          effectiveDerivedPrice { amount currency }
          imageLink
          additionalImageLink
          link
          price { amount currency }
          salePrice { amount currency }
          sourceFeedType
          targetCountry
          title
        }
      }
    }`;

    let cjResponse;
    let text;

    try {
      cjResponse = await fetch(CJ_ENDPOINT, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.CJ_API_TOKEN}`,
          "content-type": "application/json",
          "requestor-cid": CJ_COMPANY_ID,
          "user-agent": "DealPipeIngestion/1.0",
        },
        body: JSON.stringify({ query }),
      });

      text = await cjResponse.text();
    } catch (error) {
      return json({
        ok: false,
        stage: "cloudflare_to_cj",
        error: String(error?.message || error),
      }, 502);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }

    const rows = Array.isArray(body?.data?.products?.resultList)
      ? body.data.products.resultList
      : [];

    const verifiedLocal = rows.filter((row) => {
      const local = String(row?.customLabel1 || "").toLowerCase() === "local";
      const zips = zipCodes(row?.customLabel3);
      return local && zips.includes(zip);
    });

    return json({
      ok: cjResponse.ok && !body?.errors,
      cloudflare_to_cj_status: cjResponse.status,
      requested_market: { city, state, zip },
      cj_query_keywords: keywords,
      cj_result_count: rows.length,
      verified_local_count: verifiedLocal.length,
      verified_local: verifiedLocal,
      cj_errors: body?.errors || null,
      cj_raw_error: !cjResponse.ok && body?.raw ? body.raw : null,
    }, cjResponse.ok ? 200 : cjResponse.status);
  },
};
