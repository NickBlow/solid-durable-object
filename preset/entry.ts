// @ts-ignore
import "#internal/nitro/virtual/polyfill";
// @ts-ignore
import { requestHasBody } from "#internal/nitro/utils";
// @ts-ignore
import { nitroApp } from "#internal/nitro/app";
// @ts-ignore
import { runCronTasks, useRuntimeConfig } from "#internal/nitro";
// @ts-ignore
import { getPublicAssetMeta } from "#internal/nitro/virtual/public-assets";
import { Buffer } from 'node:buffer';
import { withoutBase } from "ufo";
import wsAdapter from "crossws/adapters/cloudflare";
import type { ExecutionContext } from "@cloudflare/workers-types";
import {
    getAssetFromKV,
    mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";
import { useNitroApp } from "nitropack/dist/runtime/app";

const nitroApp = useNitroApp();

interface Env {
    DURABLE_SOLID: DurableObjectNamespace;
}

export class DurableSolid {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request) {
        const url = new URL(request.url);
        let body;
        if (requestHasBody(request)) {
            body = Buffer.from(await request.arrayBuffer());
        }
        return nitroApp.localFetch(url.pathname + url.search, {
            context: {
                durableObjRef: this
            },
            host: url.hostname,
            protocol: url.protocol,
            method: request.method,
            headers: request.headers,
            body: body,
        });
    }
}


// @ts-ignore Bundled by Wrangler
// See https://github.com/cloudflare/kv-asset-handler#asset_manifest-required-for-es-modules
import manifest from "__STATIC_CONTENT_MANIFEST";

const ws = import.meta._websocket
    ? wsAdapter(nitroApp.h3App.websocket)
    : undefined;

interface CFModuleEnv {
    [key: string]: any;
}

export default {
    async fetch(request: Request, env: CFModuleEnv, context: ExecutionContext) {
        // Websocket upgrade
        if (
            import.meta._websocket &&
            request.headers.get("upgrade") === "websocket"
        ) {
            return ws!.handleUpgrade(request as any, env, context);
        }

        try {
            // https://github.com/cloudflare/kv-asset-handler#es-modules
            return await getAssetFromKV(
                {
                    request,
                    waitUntil(promise) {
                        return context.waitUntil(promise);
                    },
                },
                {
                    cacheControl: assetsCacheControl,
                    mapRequestToAsset: baseURLModifier,
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: JSON.parse(manifest),
                }
            );
        } catch {
            // Ignore
        }

        const id = env.DURABLE_SOLID.idFromName('todo');
        const stub = env.DURABLE_SOLID.get(id);
        return await stub.fetch(request);

    },
    scheduled(event: any, env: CFModuleEnv, context: ExecutionContext) {
        if (import.meta._tasks) {
            (globalThis as any).__env__ = env;
            context.waitUntil(
                runCronTasks(event.cron, {
                    context: {
                        cloudflare: {
                            env,
                            context,
                        },
                    },
                    payload: {},
                })
            );
        }
    },
};

function assetsCacheControl(_request: Request) {
    const url = new URL(_request.url);
    const meta = getPublicAssetMeta(url.pathname);
    if (meta.maxAge) {
        return {
            browserTTL: meta.maxAge,
            edgeTTL: meta.maxAge,
        };
    }
    return {};
}

const baseURLModifier = (request: Request) => {
    const url = withoutBase(request.url, useRuntimeConfig().app.baseURL);
    return mapRequestToAsset(new Request(url, request));
};
