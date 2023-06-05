import {parse, UrlWithParsedQuery} from 'url';
import next from 'next';
import type {NextServerOptions, NextServer} from "next/dist/server/next";
import * as http from "http";
import { WebsitesApiClientBuilder} from '@ringpublishing/graphql-api-client';
import {gql} from 'graphql-tag';
import {DocumentNode} from 'graphql/language/ast';
import {
    BootServerConfig,
    DefaultHatControllerParams,
    DefaultHatSite,
    HATParsedUrlQuery, HATUrlQuery
} from "../types";
import { ApolloQueryResult } from "@apollo/client";

const WEBSITE_API_PUBLIC = process.env.WEBSITE_API_PUBLIC!;
const WEBSITE_API_SECRET = process.env.WEBSITE_API_SECRET!;
const WEBSITE_API_NAMESPACE_ID = process.env.WEBSITE_API_NAMESPACE_ID!;
const NEXT_PUBLIC_WEBSITE_DOMAIN = process.env.NEXT_PUBLIC_WEBSITE_DOMAIN!;
const NEXT_PUBLIC_WEBSITE_API_VARIANT = process.env.NEXT_PUBLIC_WEBSITE_API_VARIANT!;
// process.argv[3] -> cde app start support
const cdePort = Number(process.argv[3]);
const PORT = process.env.PORT || cdePort || 3000;

export class BootServer {
    protected readonly isDev: boolean;
    private readonly useWebsitesAPI: boolean;
    private readonly useHatControllerParams: boolean;
    private readonly useWebsitesAPIRedirects: boolean;
    private readonly useDefaultHeaders: boolean;
    private readonly enableDebug: boolean;
    private nextApp: NextServer;
    private nextServerConfig: NextServerOptions;
    private httpServer: http.Server;
    readonly _onRequestHook: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    private readonly hatControllerParams: DefaultHatControllerParams;
    readonly _additionalDataInHatControllerParamsHook: (gqlResponse: ApolloQueryResult<DefaultHatSite>) => object;
    readonly _shouldMakeRequestToWebsiteAPIOnThisRequestHook: (req: http.IncomingMessage) => boolean;
    readonly _shouldSkipNextJsWithWebsiteAPIOnThisRequestHook: (req: http.IncomingMessage) => boolean;
    readonly _prepareCustomGraphQLQueryToWebsiteAPIHook: (url: string, variantId: string) => DocumentNode;

    constructor({
                    useDefaultHeaders = true as boolean,
                    useWebsitesAPIRedirects = true as boolean,
                    useHatControllerParams = true as boolean,
                    useWebsitesAPI = true as boolean,
                    enableDebug = false as boolean,
                    nextServerConfig = {} as NextServerOptions,
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
        this.enableDebug = enableDebug;

        this.setNextConfig(nextServerConfig);
        this._onRequestHook = (req, res) => {
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
        this._shouldSkipNextJsWithWebsiteAPIOnThisRequestHook = (req) => {
            const defaultPathCheckValue = this._shouldSkipNextJsWithWebsiteAPIOnThisRequest(req);

            return shouldSkipNextJsWithWebsiteAPIOnThisRequest(req, defaultPathCheckValue) || defaultPathCheckValue;
        }
    }

    /**
     * Sets Next server.
     */
    setNextApp(nextApp: NextServer) {
        this.nextApp = nextApp;
    }

    /**
     * Creates Next server based on current config. Creates only once.
     */
    createNextApp() {
        if (typeof this.nextApp === 'undefined') {
            this.nextApp = next(this.getNextConfig());
        }
    }

    /**
     * Returns Next server config.
     */
    getNextConfig() {
        return this.nextServerConfig;
    }

    /**
     * Returns Next server.
     */
    getNextApp() {
        return this.nextApp;
    }

    /**
     * Sets Next server config.
     */
    setNextConfig(nextServerConfig: NextServerOptions) {
        if (typeof nextServerConfig.dev !== "boolean") {
            nextServerConfig.dev = this.isDev;
        }
        nextServerConfig.isNextDevCommand = false;
        nextServerConfig.customServer = true;
        this.nextServerConfig = nextServerConfig;
    }

    /**
     * Return node http server. It's created after start() call.
     */
    getHttpServer() {
        return this.httpServer;
    }

    /**
     * Function runs Next server and creates the http server and start listening it on configured port.
     */
    async start(shouldListen = true):Promise<void> {
        try {
            this.createNextApp();
            const nextApp = this.getNextApp();
            const handle = nextApp.getRequestHandler();

            return nextApp.prepare().then(() => {
                this.httpServer = http.createServer((req, res) => this._requestListener(req, res, new HatControllerParams(), handle))
                if(shouldListen) {
                    this.httpServer.listen(PORT);
                    console.log(
                        `> Server listening at http://localhost:${PORT} as ${
                            this.isDev ? 'development' : process.env.NODE_ENV
                        }`
                    )
                }
            });
        } catch (e) {
            throw(e);
        }
    }
    async _requestListener(req, res, hatControllerParamsInstance, handle) {
        let perf = 0;

        const parsedUrlQuery: UrlWithParsedQuery = parse(req.url, true);

        if (req.headers?.host) {
            parsedUrlQuery.host = req.headers.host;
            parsedUrlQuery.hostname = req.headers.host.replace(`:${PORT}`, '');
        }

        if (this.enableDebug) {
            perf = performance.now();
        }

        if (this.useDefaultHeaders) {
            this._setDefaultHeaders(res);
        }

        await this._onRequestHook(req, res);

        if (this._shouldSkipNextJsWithWebsiteAPIOnThisRequestHook(req)) {
            await handle(req, res, parsedUrlQuery);
            if (this.enableDebug) {
                console.log(`Request ${req.url} took ${performance.now() - perf}ms`)
            }
            res.end();
            return;
        }

        if (this.useWebsitesAPI) {
            if (await this._applyWebsiteAPILogic(req, res, hatControllerParamsInstance)) {
                return;
            }
        }

        if (this.useHatControllerParams) {
            hatControllerParamsInstance.customData = this._additionalDataInHatControllerParamsHook(hatControllerParamsInstance.gqlResponse);
            hatControllerParamsInstance.urlWithParsedQuery = parsedUrlQuery;
            hatControllerParamsInstance.isMobile = this.isMobile(req);
        }

        const customQuery:HATUrlQuery = {
            url: req.url,
            hatControllerParams: hatControllerParamsInstance
        }

        // @ts-ignore
        const nextParsedUrlQuery: HATParsedUrlQuery = {
            ...parsedUrlQuery.query,
            ...customQuery
        }

        await this.nextApp.render(req, res, parsedUrlQuery.pathname || req.url, nextParsedUrlQuery);

        if (this.enableDebug) {
            console.log(`Request ${req.url} took ${performance.now() - perf}ms`)
        }
    }

    async _applyWebsiteAPILogic(req, res, hatControllerParamsInstance) {
        let responseEnded = false;
        if (this._shouldMakeRequestToWebsiteAPIOnThisRequestHook(req)) {

            if (!global.websitesApiApolloClient) {
                global.websitesApiApolloClient = new WebsitesApiClientBuilder({
                    accessKey: WEBSITE_API_PUBLIC,
                    secretKey: WEBSITE_API_SECRET,
                    spaceUuid: WEBSITE_API_NAMESPACE_ID
                }).buildApolloClient();
            }

            let variant = NEXT_PUBLIC_WEBSITE_API_VARIANT;

            if (req.headers['x-websites-config-variant']) {
                variant = req.headers['x-websites-config-variant'];
            }

            let perf = 0;

            if (this.enableDebug) {
                perf = performance.now();
            }

            const response = await global.websitesApiApolloClient.query({
                query: this._prepareCustomGraphQLQueryToWebsiteAPIHook(`${NEXT_PUBLIC_WEBSITE_DOMAIN}${req.url}`, variant)
            }) as ApolloQueryResult<DefaultHatSite>

            if (this.enableDebug) {
                console.log(`Website API request '${NEXT_PUBLIC_WEBSITE_DOMAIN}${req.url}' for '${variant}' variant took ${performance.now() - perf}ms`)
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

    _shouldSkipNextJsWithWebsiteAPIOnThisRequest(req) {
        const hasUrl = Boolean(req.url);
        const isApiRequest = hasUrl && req.url.startsWith('/api/');

        return hasUrl && isApiRequest;
    }

    _setDefaultHeaders(res) {
        // @TODO: add default headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    _handleWebsitesAPIRedirects(req, res, location, statusCode) {
        if (req.headers?.host?.includes('localhost')) {
            const newLocation = new URL(location);
            newLocation.host = 'localhost';
            newLocation.port = `${PORT}`;
            newLocation.protocol = 'http';

            location = newLocation.toString();
        }
        res.writeHead(statusCode, {'Location': location});
        res.end();
    }

    /**
     * Returns GraphQl object with nesesery keys.
     */
    getQuery(url, variantId, dataContent)  {
        return gql`
            query {
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
                    id
                }
                content {
                    __typename
                    ...on Story {
                        id,
                        title
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
                        name
                    }
                    ...on Source{
                        id,
                        name
                    }
                    ...on Author{
                        id,
                        name
                    }
                    ...on CustomAction{
                        id,
                        action
                    }
                }
            }`
    }

    private isMobile(req: http.IncomingMessage): boolean {
        const headers = req.headers;
        const acceleratorDeviceType = headers['x-oa-device-type'];
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

        const ua = headers['user-agent'];

        if(!ua) {
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
};
