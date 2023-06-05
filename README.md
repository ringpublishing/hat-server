
## Description
This is a server for Head App Template.

## Development

To install and work on hat-server locally:

Clone the repository and
```bash
npm i
```

To watch for changes and continually rebuild the package:

```bash
npm run dev
```

When developing `hat-server` by using `hat-boilderplate`, you should use `npm link`

On `hat-server` repository:
```bash
npm link
```

On `hat-boilderplate` repository:
```bash
npm link "hat-server"
```

### Running Tests

```bash
npm run test
```

### Know issues
- When using `npm run test-watch` some tests may fail because server is not stopped properly and throws an error. Please use `npm run test` instead.

## Usages

#### Basic usage:

```typescript
import {BootServer, BootServerConfig} from "hat-server";

const bootServer = new BootServer({} as BootServerConfig);
bootServer.start();
```

#### Additional/override headers:

> Those headers will override default headers of `BootServer` but, won't override Next headers, to override them use Next.js features.

```typescript
import {BootServer, BootServerConfig} from "hat-server";

const bootServer = new BootServer({
    onRequest: (req, res) => {
        res.setHeader('X-XSS-Protection', '1; mode=block');
    },
} as BootServerConfig);
bootServer.start();
```
#### Additional data in controller params:

```typescript
import { ApolloQueryResult } from "@apollo/client";
import { BootServer, BootServerConfig } from "hat-server";

const bar = 'test'

const bootServer = new BootServer({
    additionalDataInControllerParams: (gqlResponse: ApolloQueryResult<DefaultHatSite>) => {
        return {
            myCustomKey: 'myCustomValue',
            customFnc: (toReturn) => {
              if (toReturn === 'foo') {
                return gqlResponse.data.site.headers;
              }
              return bar;
            },
        }
    },
} as BootServerConfig);
bootServer.start();
```

In `app/page.tsx`:
```typescript
//...
export default async function Page(props) {
    console.log(props.searchParams.controllerParams.customData.myCustomKey); // return 'myCustomValue'
    console.log(props.searchParams.controllerParams.customData.customFnc('foo')); // return { location: null }
    console.log(props.searchParams.controllerParams.customData.customFnc('bar')); // return 'test'
//...
```

#### Add/reduce requests to Website API for specific requests

```typescript
import {BootServer, BootServerConfig} from "hat-server";
import http from "http";

const bootServer = new BootServer({
    shouldMakeRequestToWebsiteAPIOnThisRequest: (req: http.IncomingMessage, defaultPathCheckValue) => {
        if (req.path) {
            const shouldMakeRequestForCustomPath = !req.path.includes('custom/path/without/request');

            return defaultPathCheckValue && shouldMakeRequestForCustomPath;
        }
        return defaultPathCheckValue;
    },
} as BootServerConfig);
bootServer.start();
```
> To checking we recommend `String.includes` or `String.indexOf` because of performance, we advise against using `String.match` or any Regexp.

#### Extending GraphQl query with type

This example will extend `Story` type with:

```
kind {
    name
}
```

You also have to provide correct types for typescript.

```typescript
import {BootServer, BootServerConfig} from "hat-server";
import http from "http";

import {
    Author,
    BootServer,
    BootServerConfig,
    CustomAction,
    DefaultHatSite, Scalars,
    Site,
    SiteData,
    SiteNode,
    Source, Story as DefaultStory, Topic
} from "hat-server";
import {ApolloQueryResult} from "@apollo/client";

export interface CustomHatSite extends DefaultHatSite {
    site: CustomSite
}

export interface CustomSite extends Site {
    data: CustomSiteData
}

export interface CustomSiteData extends SiteData {
    content: CustomSiteContent
}

export type CustomSiteContent =
    | Author
    | CustomAction
    | SiteNode
    | Source
    | Story
    | Topic

export interface Story extends DefaultStory {
    kind: Kind
}

export interface Kind {
    name: Scalars['String']
}

const bootServer = new BootServer({
    prepareCustomGraphQLQueryToWebsiteAPI: (url, variantId, defaultGraphqlQuery) => {
        return bootServer.getQuery(url, variantId, `
            data {
                content {
                    __typename
                    ...on Story {
                        id,
                        title,
                        kind {
                            name
                        }
                    }
                    ...on SiteNode {
                        id,
                        slug
                    }
                    ...on Topic {
                        id,
                        name
                    }
                    ...on  Source{
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
            }`)
    },
    additionalDataInControllerParams: (gqlResponse: ApolloQueryResult<CustomHatSite>) => {
        if (gqlResponse.data?.site.data.content.__typename === 'Story') {
            console.log(gqlResponse.data.site.data.content.kind) // return { name: 'Article' }
        }
    },
} as BootServerConfig);
bootServer.start();
```

> Remember to check if the given query does not return errors for example via `additionalDataInControllerParams`

In case when you want to reduce returned values for example without `Story`, then you have to prepare mapper for missing properties for other components which can be using them.

For more use cases, see a file: `__tests__/BootServer.spec.ts`.

