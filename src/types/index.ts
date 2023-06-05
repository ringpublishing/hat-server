import { ApolloQueryResult } from "@apollo/client";
import {NextParsedUrlQuery, NextUrlWithParsedQuery} from "next/dist/server/request-meta";
import {NextServerOptions} from "next/dist/server/next";
import http from "http";
import {DocumentNode} from "graphql/language/ast";
import {UrlWithParsedQuery} from "url";

export interface BootServerConfig {
    /**
     * Add default headers automatically
     */
    useDefaultHeaders?: boolean,
    /**
     * Defines whether to enable redirects from Website API or not, works only when useWebsitesAPI is enabled
     */
    useWebsitesAPIRedirects?: boolean,
    /**
     * Defines whether to pass controller params (Website API and custom ones) to nextJS
     */
    useHatControllerParams?: boolean,
    /**
     * Defines whether to fetch data from the website API or not
     */
    useWebsitesAPI?: boolean,
    /**
     * Enables debug mode, may appear console logs
     */
    enableDebug?: boolean,
    /**
     * Custom NextServerOptions
     */
    nextServerConfig?: NextServerOptions,
    /**
     * Event that is called on every request to the server, before NextJS rendering
     */
    onRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => void,
    /**
     * Function which should return an object with custom properties.
     * In function first argument is `hatControllerParams.gqlResponse`
     * Data will be available at: `hatControllerParams.customData`
     */
    additionalDataInHatControllerParams?: (gqlResponse: ApolloQueryResult<DefaultHatSite>) => any | void,
    /**
     * Function which should return a boolean, which determines whether for the given request
     * it should make request to the Website API or not.
     */
    shouldMakeRequestToWebsiteAPIOnThisRequest?: (req: http.IncomingMessage, defaultPathCheckValue: boolean) => boolean | void,
    /**
     * Function gives us the ability to overwrite or edit the default GraphQL query.
     */
    prepareCustomGraphQLQueryToWebsiteAPI?: (url: string, variantId: string, defaultGraphqlQuery: DocumentNode) => DocumentNode | void,
    /**
     * Function which should return a boolean, which determines whether for the given request
     * it should handle request as common express request, without request to WebsiteAPI.
     */
    shouldSkipNextJsWithWebsiteAPIOnThisRequest?: (req: http.IncomingMessage, defaultPathCheckValue: boolean) => boolean | void,
}

export interface DefaultHatControllerParams {
    gqlResponse: ApolloQueryResult<DefaultHatSite>;
    customData: any;
    urlWithParsedQuery: UrlWithParsedQuery
    isMobile: boolean
}

// @ts-ignore
export interface HATParsedUrlQuery extends HATUrlQuery, NextParsedUrlQuery {}
export interface HATUrlWithParsedQuery extends HATUrlQuery, NextUrlWithParsedQuery {}

export interface HATUrlQuery {
    hatControllerParams: DefaultHatControllerParams;
    url: string;
}

export type Headers = {
    location: Scalars["URL"];
}

export type DefaultHatSite = {
    site: Site,
}

export type Site = {
    data: SiteData
    headers: Headers
    statusCode: number
}

export type SiteData = {
    content: SiteContent,
    node: SiteNodeId
}

export type SiteContent =
    | Author
    | CustomAction
    | SiteNode
    | Source
    | Story
    | Topic

export type Author = {
    __typename: "Author"
    id: Scalars["UUID"]
}

export type CustomAction = {
    __typename: "CustomAction"
    id: Scalars["UUID"],
    action: Scalars["String"]
}

// @TODO: jak to inaczej ograć?
export type SiteNodeId = {
    id: Scalars["UUID"]
}

export type SiteNode = {
    __typename: "SiteNode"
    id: Scalars["UUID"]
    slug: Scalars["String"]
    category: {
        id: Scalars["UUID"]
    }
}

export type Source = {
    __typename: "Source"
    id: Scalars["UUID"]
    name: Scalars["String"]
}

export type Story = {
    __typename: "Story"
    id: Scalars["UUID"]
    title: Scalars["String"]
}

export type Topic = {
    __typename: "Topic"
    id: Scalars["UUID"]
    name: Scalars["String"]
}

export type Scalars = {
    ID: string
    String: string
    Boolean: boolean
    Int: number
    Float: number
    BigInt: any
    ContentCursor: any
    DateTime: any
    Domain: any
    ImageURL: any
    JSONObject: any
    URL: any
    UUID: any
}
