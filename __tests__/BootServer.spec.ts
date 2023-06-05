import * as http from "http";

const {apiKeys, MockNextServer, contentQueryMock} = require('../__mocks__/testData');
const httpMocks = require('node-mocks-http');
Object.keys(apiKeys).forEach((key) => {
    process.env[key] = apiKeys[key];
})

import {NextServer} from "next/dist/server/next";
import {BootServer, BootServerConfig, HatControllerParams} from "../src";
describe("BootServer", () => {
    let mockNextServer;
    beforeEach(() => {
        mockNextServer = {...MockNextServer};
    })
    describe("- general", () => {
        describe("should throw when missing nesesery API keys", () => {
            it('PUBLIC, SECRET, NAMESPACE_ID', () => {
                // We need to isolate the require for BootServer because during the require, the process.env is set
                // and after the require, we cannot change them for the module
                jest.isolateModules(() => {
                    expect(() => {
                        delete process.env['WEBSITE_API_PUBLIC'];
                        delete process.env['WEBSITE_API_SECRET'];
                        delete process.env['WEBSITE_API_NAMESPACE_ID'];
                        const BootServer = require("../src").BootServer;
                        new BootServer({} as BootServerConfig);
                    }).toThrow("Missing: WEBSITE_API_PUBLIC WEBSITE_API_SECRET WEBSITE_API_NAMESPACE_ID")
                })
            })

            it('DOMAIN with useWebsitesAPI: false', () => {
                jest.isolateModules(() => {
                    expect(() => {
                        delete process.env['WEBSITE_API_PUBLIC'];
                        delete process.env['WEBSITE_API_SECRET'];
                        delete process.env['WEBSITE_API_NAMESPACE_ID'];
                        delete process.env['NEXT_PUBLIC_WEBSITE_DOMAIN'];
                        delete process.env['NEXT_PUBLIC_WEBSITE_API_VARIANT'];
                        const BootServer = require("../src").BootServer;
                        new BootServer({
                            useWebsitesAPI: false,
                        } as BootServerConfig);
                    }).toThrow("Missing: NEXT_PUBLIC_WEBSITE_DOMAIN")
                })
            })

            it('should set host and hostname when req.headers.host is present', async () => {
                const port = 3000;
                const host = 'localhost';
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({ url: '/', headers: { host: `${host}:${port}` } });
                const res = httpMocks.createResponse();

                mockNextServer.render = (req, res, url, queryParams) => {
                    expect(queryParams.hatControllerParams.urlWithParsedQuery.host).toBe(`${host}:${port}`);
                    expect(queryParams.hatControllerParams.urlWithParsedQuery.hostname).toBe(host);
                }
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
            });
        })
    })

    describe("- private functions", () => {
        describe("_shouldMakeRequestToWebsiteAPIOnThisRequest()", () => {
            it('should been called as default', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({url: 'http://localhost',});
                const res = httpMocks.createResponse();
                const spyFn = jest.spyOn(bootServer, '_shouldMakeRequestToWebsiteAPIOnThisRequest');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).toHaveBeenCalled();
            })
            it('should return true for common urls', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'http://localhost/',
                }))).toBeTruthy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'https://demo-ring.com/',
                }))).toBeTruthy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'https://demo-ring.com/news/',
                }))).toBeTruthy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'https://demo-ring.com/galeries/id-esse-ex-2/3j25nh5',
                }))).toBeTruthy();
            })
            it('should return false for internal next requests', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'http://localhost/_next/css/file.css',
                }))).toBeFalsy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'https://demo-ring.com/_next/css/file.css',
                }))).toBeFalsy();
            })
            it('should return false for favicon.ico', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'http://localhost/favicon.ico',
                }))).toBeFalsy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: 'https://demo-ring.com/favicon.ico',
                }))).toBeFalsy();
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/favicon.ico',
                }))).toBeFalsy();
            })
            it('should return false for request without url', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                expect(bootServer._shouldMakeRequestToWebsiteAPIOnThisRequest(httpMocks.createRequest({}))).toBeFalsy();
            })
        })

        describe("_onRequestHook()", () => {
            it('should been called when onRequest is defined', async () => {
                const stub = jest.fn();
                const bootServer = new BootServer({
                    onRequest: stub
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({url: '/',});
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(stub).toHaveBeenCalled();
            })
            it('should been called before _applyWebsiteAPILogic and after _setDefaultHeaders', async () => {
                const orderCall:Array<number> = [];
                const stub = jest.fn(() => {orderCall.push(2)});
                const bootServer = new BootServer({
                    onRequest: stub
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({url: '/',});
                const res = httpMocks.createResponse();

                bootServer._setDefaultHeaders = jest.fn(() => {orderCall.push(1)});
                // @ts-ignore
                bootServer._applyWebsiteAPILogic = jest.fn(() => {orderCall.push(3)});

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(bootServer._setDefaultHeaders).toHaveBeenCalled();
                expect(stub).toHaveBeenCalled();
                expect(bootServer._applyWebsiteAPILogic).toHaveBeenCalled();
                expect(orderCall).toEqual([1, 2, 3])
            })
        })

        describe("_additionalDataInHatControllerParamsHook()", () => {
            it('should been called when additionalDataInHatControllerParams is defined', async () => {
                const stub = jest.fn((gqlResponse) => {
                    expect(gqlResponse.data.site).toBeDefined();
                });
                const bootServer = new BootServer({
                    additionalDataInHatControllerParams: stub
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({url: '/',});
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(stub).toHaveBeenCalled();
            })
        })

        describe("_prepareCustomGraphQLQueryToWebsiteAPIHook()", () => {
            it('should been called when prepareCustomGraphQLQueryToWebsiteAPI is defined', async () => {
                const stub = jest.fn((url, variantId, defaultGraphqlQuery) => {
                    expect(url).toEqual('https://demo-ring.com/');
                    expect(variantId).toEqual('ALL_FEATURES_BACKUP');
                    // we are removing all new lines and doubled spaces because this shouldn't affect the result of the query
                    expect(defaultGraphqlQuery).toBeDefined();
                });
                const bootServer = new BootServer({
                    prepareCustomGraphQLQueryToWebsiteAPI: stub
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({url: '/',});
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(stub).toHaveBeenCalled();
            })
        })

        describe('_shouldSkipNextJsWithWebsiteAPIOnThisRequest()', () => {
            it('should return true when the request has a URL containing /api/', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/api/test'
                }))).toBeTruthy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/api/test?test=1'
                }))).toBeTruthy();
            });

            it('should return false when the request has a URL without /api/', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/api'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/api?api=1'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/test/api'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/test/api?api=1'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/apiTest/api?api=1'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/whatever/api/test'
                }))).toBeFalsy();
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({
                    url: '/whatever/api/test?api=1'
                }))).toBeFalsy();
            });

            it('should return false when the request does not have a URL', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                const req = httpMocks.createRequest({});
                expect(bootServer._shouldSkipNextJsWithWebsiteAPIOnThisRequest(httpMocks.createRequest({}))).toBeFalsy();
            });
        });
    });
    describe("- public functions", () => {
        describe("createNextApp()", () => {
            it('should create next app if not exists', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                expect(bootServer.getNextApp()).not.toBeDefined();
                bootServer.createNextApp();
                const nextApp = bootServer.getNextApp();
                expect(nextApp).toBeDefined();
                bootServer.createNextApp();
                expect(nextApp).toEqual(bootServer.getNextApp())
            });
        })

        describe("getNextApp()", () => {
            it('should return correct next app', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                bootServer.createNextApp();
                expect(bootServer.getNextApp()).toEqual(mockNextServer);
            });
        })

        describe("getHttpServer()", () => {
            it('should return http server after start()', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                expect(bootServer.getHttpServer()).not.toBeDefined();
                bootServer.start().then(() => {
                    expect(bootServer.getHttpServer()).toBeDefined();
                })
            });
        })
        describe("getQuery()", () => {
            it('should return object', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                expect(bootServer.getQuery("https://demo-ring.com/galeries/id-esse-ex-2XX/3j25nh5", "ALL_FEATURES_BACKUP", bootServer.getDataContentQueryAsString())).toBeDefined();
            });
        })
        describe("getDataContentQueryAsString()", () => {
            it('should return default data content query', () => {
                const bootServer = new BootServer({} as BootServerConfig);
                expect(bootServer.getDataContentQueryAsString().replace(/(\r\n|\n|\r|\s{2,})/gm, "").trim()).toEqual(contentQueryMock.replace(/(\r\n|\n|\r|\s{2,})/gm, "").trim());
            });
        })
    })

    describe("- construction options", () => {
        describe("useDefaultHeaders", () => {
            it('should apply default headers as default', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(res.getHeaders()['x-content-type-options']).toEqual('nosniff');
            });
            it('should not apply default headers when useDefaultHeaders is false', async () => {
                const bootServer = new BootServer({
                    useDefaultHeaders: false,
                } as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(res.getHeaders()['x-content-type-options']).not.toBeDefined();
            });
        })
        describe("useWebsitesAPI", () => {
            it('should call _applyWebsiteAPILogic as default', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_applyWebsiteAPILogic');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).toHaveBeenCalled();
            });
            it('should not call _applyWebsiteAPILogic when useWebsitesAPI is false', async () => {
                const bootServer = new BootServer({
                    useWebsitesAPI: false,
                } as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_applyWebsiteAPILogic');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).not.toHaveBeenCalled();
            });
            it('should not call _shouldMakeRequestToWebsiteAPIOnThisRequestHook when useWebsitesAPI is false', async () => {
                const bootServer = new BootServer({
                    useWebsitesAPI: false,
                } as BootServerConfig);
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_shouldMakeRequestToWebsiteAPIOnThisRequestHook');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).not.toHaveBeenCalled();
            });
        })
        describe("useHatControllerParams", () => {
            it('should return customData in hatControllerParams as default', async () => {
                const bootServer = new BootServer({
                    additionalDataInHatControllerParams: () => {
                        return {
                            test: 'testData'
                        }
                    }
                } as BootServerConfig);
                mockNextServer.render = (req, res, url, queryParams) => {
                    expect(queryParams.hatControllerParams.customData).toEqual({
                        test: 'testData'
                    });
                }
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
            });
            it('should return gqlResponse in hatControllerParams as default', async () => {
                const bootServer = new BootServer({} as BootServerConfig);
                mockNextServer.render = (req, res, url, queryParams) => {
                    expect(queryParams.hatControllerParams.gqlResponse).not.toEqual({});
                }
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
            });
            it('should return empty objects in hatControllerParams when useHatControllerParams is false', async () => {
                const bootServer = new BootServer({
                    useHatControllerParams: false,
                } as BootServerConfig);
                mockNextServer.render = (req, res, url, queryParams) => {
                    expect(queryParams.hatControllerParams).toEqual({});
                }
                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/',
                });
                const res = httpMocks.createResponse();

                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
            });
        })
        describe("useWebsitesAPIRedirects", () => {
            it('should handle Websites API redirect as default', async () => {
                const bootServer = new BootServer({} as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/galeries/id-esse-ex-2XX/3j25nh5',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_handleWebsitesAPIRedirects');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).toHaveBeenCalled();
                expect(res.statusCode).toEqual(301);
                expect(res.getHeaders().location).toEqual('https://demo-ring.com/galeries/id-esse-ex-2/3j25nh5');
            });
            it('should not redirect when useWebsitesAPIRedirects is false', async () => {
                const bootServer = new BootServer({
                    useWebsitesAPIRedirects: false
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/galeries/id-esse-ex-2XX/3j25nh5',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_handleWebsitesAPIRedirects');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).not.toHaveBeenCalled();
                expect(res.statusCode).not.toEqual(301);
                expect(res.getHeaders().location).not.toEqual('https://demo-ring.com/galeries/id-esse-ex-2/3j25nh5');
            });
            it('should not redirect when useWebsitesAPI is false', async () => {
                const bootServer = new BootServer({
                    useWebsitesAPI: false
                } as BootServerConfig);

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/galeries/id-esse-ex-2XX/3j25nh5',
                });
                const res = httpMocks.createResponse();

                const spyFn = jest.spyOn(bootServer, '_handleWebsitesAPIRedirects');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});
                expect(spyFn).not.toHaveBeenCalled();
                expect(res.statusCode).not.toEqual(301);
                expect(res.getHeaders().location).not.toEqual('https://demo-ring.com/galeries/id-esse-ex-2/3j25nh5');
            });
            it('should end request after successfully redirect -> no more fnc calls', async () => {
                const bootServer = new BootServer({} as BootServerConfig);

                const spyRender = jest.spyOn(mockNextServer, 'render');
                const spyRequestHandler = jest.spyOn(mockNextServer, 'getRequestHandler');

                bootServer.setNextApp(mockNextServer as NextServer);
                const req = httpMocks.createRequest({
                    url: '/galeries/id-esse-ex-2XX/3j25nh5',
                });
                const res = httpMocks.createResponse();

                const spyWebsiteApiLogic = jest.spyOn(bootServer, '_applyWebsiteAPILogic');
                const spyAdditionalHatControllerParams = jest.spyOn(bootServer, '_additionalDataInHatControllerParamsHook');
                await bootServer._requestListener(req, res, new HatControllerParams(), () => {});

                expect(spyWebsiteApiLogic).toHaveBeenCalled();
                expect(spyAdditionalHatControllerParams).not.toHaveBeenCalled();
                expect(spyRender).not.toHaveBeenCalled();
                expect(spyRequestHandler).not.toHaveBeenCalled();
            });
        })
    });
})

