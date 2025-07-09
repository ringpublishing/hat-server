import {parse, UrlWithParsedQuery} from 'url';
import * as http from "http";
import {WebsitesApiClientBuilder} from '@ringpublishing/graphql-api-client';
import {gql} from 'graphql-tag';
import {DocumentNode} from 'graphql/language/ast';
import {
    BootServerConfig, CacheService,
    DefaultHatControllerParams,
    DefaultHatSite,
    HATUrlQuery
} from "../types";
import {ApolloQueryResult} from "@apollo/client";
import {RingDataLayer} from "./RingDataLayer";
import os from 'os';

export type MiddlewareBeforeResponseToReturn = { responseToReturn: Response };

export type MiddlewareBeforeResponse = MiddlewareBeforeResponseToReturn | Response;

const WEBSITE_API_PUBLIC = process.env.WEBSITE_API_PUBLIC!;
const WEBSITE_API_SECRET = process.env.WEBSITE_API_SECRET!;
const WEBSITE_API_NAMESPACE_ID = process.env.WEBSITE_API_NAMESPACE_ID!;
const NEXT_PUBLIC_WEBSITE_DOMAIN = process.env.NEXT_PUBLIC_WEBSITE_DOMAIN!;
const NEXT_PUBLIC_WEBSITE_API_VARIANT = process.env.NEXT_PUBLIC_WEBSITE_API_VARIANT!;
const HAT_SERVER_WEBSITE_API_TTL = Number(process.env.HAT_SERVER_WEBSITE_API_TTL) || 60;
const HAT_SERVER_SHOW_URLS_IN_CONSOLE = process.env.HAT_SERVER_SHOW_URLS_IN_CONSOLE || false;
// process.argv[3] -> cde app start support
const cdePort = Number(process.argv[3]);
const PORT = process.env.PORT || cdePort || 4321;

export class BootServer {
    protected readonly isDev: boolean;
    private readonly useWebsitesAPI: boolean;
    private readonly useHatControllerParams: boolean;
    private readonly useWebsitesAPIRedirects: boolean;
    private readonly useDefaultHeaders: boolean;
    private readonly useAccRdl: boolean;
    private readonly enableDebug: boolean;
    private readonly healthCheckPathname: string;
    private readonly cacheProvider: CacheService;
    private httpServer: http.Server;
    readonly _onRequestHook: (req: HatRequest, res: Response) => void;
    private readonly hatControllerParams: DefaultHatControllerParams;
    readonly _additionalDataInHatControllerParamsHook: (gqlResponse: ApolloQueryResult<DefaultHatSite>) => object;
    readonly _shouldMakeRequestToWebsiteAPIOnThisRequestHook: (req: http.IncomingMessage) => boolean;
    readonly _prepareCustomGraphQLQueryToWebsiteAPIHook: (url: string, variantId: string) => DocumentNode;
    private ringDataLayer: RingDataLayer;
    private apolloClientTimeout: number;
    private use304Functionality: boolean;
    private use304FunctionalityTTL_IN_SECONDS: number;

    constructor({
                    useDefaultHeaders = true as boolean,
                    useWebsitesAPIRedirects = true as boolean,
                    useHatControllerParams = true as boolean,
                    useWebsitesAPI = true as boolean,
                    useAccRdl = true as boolean,
                    enableDebug = false as boolean,
                    healthCheckPathname = '/_healthcheck' as string,
                    apolloClientTimeout = 10000 as number,
                    onRequest = () => {
                    },
                    additionalDataInHatControllerParams = () => {
                    },
                    shouldMakeRequestToWebsiteAPIOnThisRequest = () => {
                    },
                    shouldSkipNextJsWithWebsiteAPIOnThisRequest = () => {
                    },
                    prepareCustomGraphQLQueryToWebsiteAPI = () => {
                    },
                    cacheProvider = {
                        set: () => {
                        },
                        get: () => {
                            return null
                        },
                        runCallbackIfTimeStampHasExpired: () => {
                        },
                        getTTL: () => {
                            return 60
                        }
                    },
                    use304Functionality = false as boolean,
                    use304FunctionalityTTL_IN_SECONDS = 86400 as number
                }: BootServerConfig) {
        if (useWebsitesAPI && (!WEBSITE_API_PUBLIC || !WEBSITE_API_SECRET || !WEBSITE_API_NAMESPACE_ID)) {
            throw `Missing: ${(!WEBSITE_API_PUBLIC && 'WEBSITE_API_PUBLIC') || ''}${(!WEBSITE_API_SECRET && ' WEBSITE_API_SECRET') || ''}${(!WEBSITE_API_NAMESPACE_ID && ' WEBSITE_API_NAMESPACE_ID') || ''}`;
        }

        if (!NEXT_PUBLIC_WEBSITE_DOMAIN) {
            throw `Missing: ${(!NEXT_PUBLIC_WEBSITE_DOMAIN && 'NEXT_PUBLIC_WEBSITE_DOMAIN') || ''}`;
        }

        // process.env.ONET_SEGMENT?.toLowerCase().startsWith('c_') -> cde app start support
        this.isDev = process.env.ONET_SEGMENT?.toLowerCase().startsWith('c_') || process.env.NODE_ENV !== 'production';
        this.useDefaultHeaders = useDefaultHeaders;
        this.useWebsitesAPIRedirects = useWebsitesAPIRedirects;
        this.useHatControllerParams = useHatControllerParams;
        this.useWebsitesAPI = useWebsitesAPI;
        this.useAccRdl = useAccRdl;
        this.enableDebug = enableDebug;
        this.healthCheckPathname = healthCheckPathname;
        this.ringDataLayer = new RingDataLayer();
        this.apolloClientTimeout = apolloClientTimeout;
        this.cacheProvider = cacheProvider;
        this.use304Functionality = use304Functionality;
        this.use304FunctionalityTTL_IN_SECONDS = use304FunctionalityTTL_IN_SECONDS;

        this._onRequestHook = (req: HatRequest, res) => {
            onRequest(req, res);
        }
        this._additionalDataInHatControllerParamsHook = (gqlResponse) => {
            return additionalDataInHatControllerParams(gqlResponse) || {};
        }
        this._prepareCustomGraphQLQueryToWebsiteAPIHook = (url, variantId) => {
            const defaultGraphqlQuery = this.getQuery(url, variantId, this.getDataContentQueryAsString());

            return prepareCustomGraphQLQueryToWebsiteAPI(url, variantId, defaultGraphqlQuery) || defaultGraphqlQuery;
        }
        this._shouldMakeRequestToWebsiteAPIOnThisRequestHook = (req) => {
            const defaultPathCheckValue = this._shouldMakeRequestToWebsiteAPIOnThisRequest(req);

            return shouldMakeRequestToWebsiteAPIOnThisRequest(req, defaultPathCheckValue) || defaultPathCheckValue;
        }
    }


    /**
     * Return node http server. It's created after start() call.
     */
    getHttpServer() {
        return this.httpServer;
    }

    //@TODO req type

    async _requestListener(req: any, res: Response) {
        let perf = 0;


        let hatControllerParamsInstance = new HatControllerParams()
        const parsedUrlQuery: UrlWithParsedQuery = parse(req.url, true);
        if (HAT_SERVER_SHOW_URLS_IN_CONSOLE) {
            console.info(parsedUrlQuery.href);
        }

        let variant = NEXT_PUBLIC_WEBSITE_API_VARIANT;

        if (req.headers.get('x-websites-config-variant')) {
            variant = req.headers.get('x-websites-config-variant') || '';
        }

        if (req.headers.get('host')) {
            parsedUrlQuery.host = req.headers.get('host');
            parsedUrlQuery.hostname = (req.headers.get('host') || '').replace(`:${PORT}`, '');
        }

        if (this.enableDebug) {
            perf = performance.now();
        }


        await this._onRequestHook(req, res);

        if (this.useWebsitesAPI) {
            if (await this._applyWebsiteAPILogic(parsedUrlQuery.pathname, req, res, hatControllerParamsInstance, variant)) {
                return;
            }
        }

        if (this.use304Functionality) {
            const use304FunctionalityRes = this.apply304Functionality(req, res, hatControllerParamsInstance);
            if (use304FunctionalityRes && use304FunctionalityRes.responseToReturn) {
                return {responseToReturn: use304FunctionalityRes.responseToReturn};
            }
        }

        let ringDataLayer: any = false;
        if (this.useAccRdl) {
            ringDataLayer = this.ringDataLayer.getRingDataLayer(parsedUrlQuery.pathname, hatControllerParamsInstance.gqlResponse);
            res.headers.set('x-acc-rdl', this.ringDataLayer.encode(ringDataLayer));
        }

        if (this.useHatControllerParams) {
            hatControllerParamsInstance.customData = this._additionalDataInHatControllerParamsHook(hatControllerParamsInstance.gqlResponse);
            hatControllerParamsInstance.urlWithParsedQuery = parsedUrlQuery;
            hatControllerParamsInstance.isMobile = this.isMobile(req);
            hatControllerParamsInstance.websiteManagerVariant = variant;
            hatControllerParamsInstance.ringDataLayer = ringDataLayer;
            // console.log(JSON.stringify(hatControllerParamsInstance));
            //@TODO put into some allowed field
            req.hatControllerParamsInstance = hatControllerParamsInstance;
        }

        //await this.nextApp.render(req, res, parsedUrlQuery.pathname || req.url, parsedUrlQuery.query);

        if (this.enableDebug) {
            console.log(`Request ${req.url} took ${performance.now() - perf}ms`)
        }

        return req;
    }

    apply304Functionality(req: Request, res: Response, hatControllerParamsInstance: HatControllerParams) {
        const currentTime = Math.floor(Date.now() / 1000);
        const revision = hatControllerParamsInstance?.gqlResponse?.data?.site?.data?.content?.system?.revision;
        const etag = `${revision}${Math.floor(currentTime / Number(this.use304FunctionalityTTL_IN_SECONDS))}`;
        if (revision && etag) {
            res.headers.set('etag', etag);
            if (req.headers.get('if-none-match') == etag) {
                return {responseToReturn: new Response(null, {status: 304})};
            }
        }

    }


    async applyMiddlewareBefore(context: any, next: any): Promise<MiddlewareBeforeResponse> {
        let responseToReturn = null;
        if (context.url.pathname === this.healthCheckPathname) {
            const freeMemMB = os.freemem() / 1024 / 1024;
            // const usedMemoryMB = process.memoryUsage().rss / 1024 / 1024;
            // const usagePercent = (usedMemoryMB / totalMemoryMB) * 100;
            //console.info(`Health check: free memory: ${freeMemMB}MB`);
            if (freeMemMB < 100) {
                return {
                    responseToReturn: new Response('Service Unavailable', { status: 503 })
                };
            }
            return {responseToReturn: new Response('ok')};
        }

        let response = new Response();
        const _requestListenerRes = await this._requestListener(context.request, response);
        if (_requestListenerRes && _requestListenerRes.responseToReturn) {
            return {responseToReturn: _requestListenerRes.responseToReturn};
        }
        return response;
    }


    async applyMiddlewareAfter(context: any, res: Response, responseFromMiddlewareBefore: MiddlewareBeforeResponse) {
        if (process.env.NEXT_PUBLIC_ACC_IMAGES_ENDPOINT) {
            res.headers.set('Permissions-Policy', `ch-ect=(self "https://${process.env.NEXT_PUBLIC_ACC_IMAGES_ENDPOINT}")`);
            res.headers.set('Accept-CH', `ect`);
        }


        if (this.useDefaultHeaders) {
            this._setDefaultHeaders(res);
        }

        if (responseFromMiddlewareBefore instanceof Response) {
            responseFromMiddlewareBefore.headers.forEach((value, key) => {
                res.headers.set(key, value);
            });

        }
    }

    async _applyWebsiteAPILogic(pathname, req, res, hatControllerParamsInstance, variant: string) {
        let responseEnded = false;
        const arrUrl = pathname.split('/');
        const pubId = arrUrl[arrUrl.length - 1];

        if (this._shouldMakeRequestToWebsiteAPIOnThisRequestHook(req)) {
            if (!global.websitesApiApolloClient) {
                global.websitesApiApolloClient = new WebsitesApiClientBuilder({
                    accessKey: WEBSITE_API_PUBLIC,
                    secretKey: WEBSITE_API_SECRET,
                    spaceUuid: WEBSITE_API_NAMESPACE_ID
                }).setTimeout(this.apolloClientTimeout).buildApolloClient();
            }


            let perf = 0;

            if (this.enableDebug) {
                perf = performance.now();
            }

            const url = `${NEXT_PUBLIC_WEBSITE_DOMAIN}${pathname}`;
            const cacheKey = `${NEXT_PUBLIC_WEBSITE_DOMAIN}${pathname}${variant}`;
            let response = await this.cacheProvider.get(cacheKey);

            if (response) {
                this.cacheProvider.runCallbackIfTimeStampHasExpired(cacheKey, async () => {
                    if(global['monitoringProvider'] && global['monitoringProvider'].counter) {
                        global['monitoringProvider'].counter('info.HatServer_applyWebsiteAPILogic.apiCall');
                    }
                    const newResponse = await global.websitesApiApolloClient.query({
                        query: this._prepareCustomGraphQLQueryToWebsiteAPIHook(url, variant),
                        fetchPolicy: 'no-cache'
                    });
                    this.cacheProvider.set(cacheKey, newResponse, HAT_SERVER_WEBSITE_API_TTL, ['pubId_' + pubId]);
                });
            } else {
                if(global['monitoringProvider'] && global['monitoringProvider'].counter) {
                    global['monitoringProvider'].counter('info.HatServer_applyWebsiteAPILogic.apiCall');
                }
                response = await global.websitesApiApolloClient.query({
                    query: this._prepareCustomGraphQLQueryToWebsiteAPIHook(url, variant),
                    fetchPolicy: 'no-cache'
                }) as ApolloQueryResult<DefaultHatSite>;
                if (!this.use304Functionality) {
                    this.cacheProvider.set(cacheKey, response, HAT_SERVER_WEBSITE_API_TTL, ['pubId_' + pubId]);
                }

            }


            if (this.enableDebug) {
                console.log(`Website API request '${NEXT_PUBLIC_WEBSITE_DOMAIN}${pathname}' for '${variant}' variant took ${performance.now() - perf}ms`)
            }

            if (this.useWebsitesAPIRedirects && response.data?.site?.headers?.location && response.data?.site?.statusCode) {
                this._handleWebsitesAPIRedirects(req, res, response.data?.site.headers.location, response.data?.site.statusCode);
                responseEnded = true;
            }

            if (this.useHatControllerParams) {
                hatControllerParamsInstance.gqlResponse = response;
            }
        }

        return responseEnded;
    }

    _shouldMakeRequestToWebsiteAPIOnThisRequest(req) {
        const hasUrl = Boolean(req.url);
        const isInternalNextRequest = hasUrl && req.url.includes('_next');
        const isFavicon = hasUrl && req.url.includes('favicon.ico');

        return hasUrl && !isInternalNextRequest && !isFavicon;
    }

    _setDefaultHeaders(res: Response) {
        res.headers.set('X-Content-Type-Options', 'nosniff');
    }

    _handleWebsitesAPIRedirects(req, res: MiddlewareBeforeResponse, location, statusCode) {
        if (req.headers?.get('host').includes('localhost')) {
            const newLocation = new URL(location);
            newLocation.host = 'localhost';
            newLocation.port = `${PORT}`;
            newLocation.protocol = 'http';
            location = newLocation.toString();
        }

        const redResp = new Response(null, {status: 301});
        redResp.headers.set('Location', location);
        // @ts-ignore
        res.responseToReturn = redResp;
    }

    /**
     * Returns GraphQl object with nesesery keys.
     */
    getQuery(url, variantId, dataContent) {
        return gql`
            query {
                contentSpaceId
                site (url: "${url}", variantId: "${variantId}") {
                    statusCode,
                    headers {
                        location
                    }
                    ${dataContent}
                }
            }
        `;
    }

    /**
     * Returns default data content for GraphQl query.
     */
    getDataContentQueryAsString() {
        return `
            data {
                node {
                    breadcrumbs {
                        slug,
                        name,
                        url
                    }
                    category {
                        id
                    }
                    id
                }
                content {
                    __typename
                    ...on Story {
                        id,
                        title,
                        mainPublicationPoint {
                            id
                        },
                        kind {
                            code
                        },
                        system{
                            revision
                        }
                        
                    }
                    ...on SiteNode {
                        id,
                        slug,
                        category {
                          id
                        }
                    }
                    ...on Topic {
                        id,
                        name,
                        publicationPoint {
                            id
                        }
                    }
                    ...on Source{
                        id,
                        name,
                        publicationPoint {
                            id
                        }
                    }
                    ...on Author{
                        id,
                        name,
                        publicationPoint {
                            id
                        }
                    }
                    ...on CustomAction{
                        id,
                        action
                    }
                }
            }`
    }

    private isMobile(req: Request): boolean {
        const headers = req.headers;
        const acceleratorDeviceType = headers.get('x-oa-device-type');
        if (acceleratorDeviceType) {
            switch (acceleratorDeviceType) {
                case 'mobile':
                case 'mobile-bot':
                    return true;
                case 'tablet':
                case 'desktop':
                case 'bot':
                case 'facebook-bot':
                default:
                    return false;
            }
        }

        // based on: https://github.com/juliangruber/is-mobile
        const mobileRE = /(android|bb\d+|meego).+mobile|armv7l|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series[46]0|samsungbrowser|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i
        const notMobileRE = /CrOS/

        const ua = headers.get('user-agent');
        if (!ua) {
            return false
        }

        return mobileRE.test(ua) && !notMobileRE.test(ua);
    }
}

export class HatControllerParams {
    public gqlResponse: any
    public customData: any
    public urlWithParsedQuery: UrlWithParsedQuery
    public isMobile: boolean
    public websiteManagerVariant: string
    public ringDataLayer: any
};

class HatRequest extends Request {
    public hatControllerParamsInstance: HatControllerParams
}
