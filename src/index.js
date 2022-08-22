/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
const imageDomain = "img.shangao.tech";
const workerName = "wandering-sun-09fb"
const userSubDomain = "lostsquirrel.workers.dev"
const imageDevDommian = `${workerName}.${userSubDomain}`;
const b2Bucket = "public-image";
const b2UrlPath = `/file/${b2Bucket}`;

const corsFileTypes = ['png', 'jpg', 'gif', 'jpeg', 'webp'];
const removeHeaders = [
    'x-bz-content-sha1',
    'x-bz-file-id',
    'x-bz-file-name',
    'x-bz-info-src_last_modified_millis',
    'X-Bz-Upload-Timestamp',
    'Expires'
];
const expiration = 31536000;

const fixHeaders = function(url, status, headers) {
    let newHdrs = new Headers(headers);
    if (corsFileTypes.includes(url.pathname.split('.').pop())) {
        newHdrs.set('Access-Control-Allow-Origin', '*');
    }
    if (status === 200) {
        newHdrs.set('Cache-Control', `public, max-age=${expiration}`);
    } else {
        newHdrs.set('Cache-Control', 'public, max-age=300');
    }
    const ETag = newHdrs.get('x-bz-content-sha1') || newHdrs.get('x-bz-info-src_last_modified_millis') || newHdrs.get('x-bz-file-id');
    if (ETag) {
        newHdrs.set('ETag', ETag);
    }
    removeHeaders.forEach(header => {
        newHdrs.delete(header);
    });
    return newHdrs;
};
async function fileReq(request, env) {
    const cache = caches.default; // Cloudflare edge caching
    const url = new URL(request.url);
    const b2host = await env.B2.get("b2download");
    if (url.host === imageDomain || url.host === imageDevDommian) {
        if (!url.pathname.startsWith(b2UrlPath)) {
            url.pathname = `${b2UrlPath}/${url.pathname}`;
        }
    }
    url.host = b2host;
    let response = await cache.match(url);
    if (response) {
        let newHdrs = fixHeaders(url, response.status, response.headers);
        newHdrs.set('X-Worker-Cache', "true");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHdrs
        });
    }
    let authToken = await env.B2.get("b2token")
    let b2Headers = new Headers(request.headers)
    b2Headers.append("Authorization", authToken)
    const modRequest = new Request(url, {
        method: request.method,
        headers: b2Headers,
        cf: { polish: "lossless" }
    })
    response = await fetch(modRequest)

    let newHdrs = fixHeaders(url, response.status, response.headers);
    response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHdrs
    });
    await cache.put(url, response.clone());
    return response;
}

export default {
    async fetch(request, env) {
        return fileReq(request, env);
    },
};