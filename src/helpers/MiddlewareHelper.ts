import {BootServer} from "../server/BootServer";

interface MiddlewareEarlyReturnRules {
    extensions?: Array<{
        status: number;
        body: string;
        list: string[];
    }>;
    queryParamsEquals?: Array<{
        status: number;
        name: string;
        value: string;
        body: string;
    }>;
    pathRegexes?: Array<{
        pattern: string;
        flags?: string;
        body: string;
        status: number;
    }>;
}

export async function MiddlewareHelper_processRequest({
                                                          context,
                                                          next,
                                                          MonitoringProvider,
                                                          bootServerOptions = {},
                                                          bypassPaths = {},
                                                          earlyReturnRules
                                                      }: {
    context: any;
    next: () => Promise<any>;
    MonitoringProvider?: any;
    bootServerOptions?: any;
    bypassPaths?: Record<string, string[]>;
    earlyReturnRules?: MiddlewareEarlyReturnRules;
}) {
    MonitoringProvider && MonitoringProvider.counter('info.middleware.onRequest');
    try {
        const reqUrl = context?.request?.url;
        const parseUrl = new URL(reqUrl);
        const rules: MiddlewareEarlyReturnRules = {
            extensions: [{
                list: ['php'],
                status: 404,
                body: 'not found'
            }, ...earlyReturnRules?.extensions || []],
            queryParamsEquals: [{
                name: 'page',
                value: '1',
                status: 410,
                body: 'The resource has been permanently removed'
            }, ...earlyReturnRules?.queryParamsEquals || []],
            pathRegexes: earlyReturnRules?.pathRegexes || []
        }

        if (rules.extensions?.length) {
            const pathname = parseUrl.pathname.toLowerCase();
            for (const group of rules.extensions) {
                for (const ext of group.list) {
                    const dotExt = ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase();
                    if (pathname.endsWith(dotExt)) {
                        return new Response(group.body, {status: group.status});
                    }
                }
            }
        }

        if (rules.queryParamsEquals?.length) {
            for (const qp of rules.queryParamsEquals) {
                if (parseUrl.searchParams.get(qp.name) === qp.value) {
                    return new Response(qp.body, {status: qp.status});
                }
            }
        }

        if (rules.pathRegexes?.length) {
            const pathname = parseUrl.pathname;
            for (const r of rules.pathRegexes) {
                const re = new RegExp(r.pattern, r.flags);
                if (re.test(pathname)) {
                    return new Response(r.body, {status: r.status});
                }
            }
        }

        if (bypassPaths[context?.request?.method]?.some((path: string) => context?.request?.url.includes(path))) {
            return await next();
        }

        const bootServer = new BootServer(bootServerOptions);
        const retResponse = await bootServer.applyMiddlewareBefore(context, next);

        MonitoringProvider && MonitoringProvider.counter('info.middleware.applyMiddlewareBefore');

        //@ts-ignore
        if (retResponse && retResponse.responseToReturn) {
            //@ts-ignore
            return retResponse.responseToReturn;
        }

        context.locals["hatControllerParams"] = context?.request["hatControllerParamsInstance"];
        let response = await next();

        await bootServer.applyMiddlewareAfter(context, response, retResponse);
        MonitoringProvider && MonitoringProvider.counter('info.middleware.applyMiddlewareAfter');

        // @ts-ignore
        if (!process.env.NODE_ENV !== 'production') {
            try {
                const html = await response.text();
                if (response.status !== 404) {
                    response.headers.set(
                        'content-length',
                        Buffer.byteLength(html, 'utf8').toString(),
                    );
                }

                return new Response(html, {
                    status: response.status,
                    headers: response.headers,
                });
            } catch (err) {
                MonitoringProvider && MonitoringProvider.counter('error.middleware.catch');
                console.error('err', err);
                return new Response('Internal server error', {
                    status: 503,
                    headers: response.headers,
                });

            }
        } else {
            return response;
        }
    } catch (err) {
        MonitoringProvider && MonitoringProvider.counter('error.middleware.catchAll');
        console.error('err', err);
        return new Response('Internal server error', {
            status: 503,
        });
    }
}