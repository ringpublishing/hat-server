import {SiteResponse} from "../types";

export class RingDataLayer {
    public encode(ringDataLayer): string {
        return Buffer.from(JSON.stringify(ringDataLayer)).toString('base64');
    }

    public getRingDataLayer(path, gqlResponse: SiteResponse | null): RingDataLayer {
        const rdl: any = {
            content: {
                object: {},
                part: 1,
                source: {
                    system: 'ring_content_space',
                    id: gqlResponse?.data?.contentSpaceId
                }
            },
            context: {
                publication_structure: {
                    root: ''
                }
            },
        };

        const id = gqlResponse?.data?.site?.data?.content?.id;
        if (id) {
            rdl.content.object.id = id;
        }

        let type = gqlResponse?.data?.site?.data?.content?.__typename;


        if (type) {
            rdl.content.object.type = this.mapType(type) || 'unknown';
        }

        // @ts-ignore
        const pubId = gqlResponse?.data?.site?.data?.content?.mainPublicationPoint?.id || gqlResponse?.data?.site?.data?.content?.publicationPoint?.id;
        if (pubId) {
            rdl.content.publication = { point: {id: pubId}}
        }

        // @ts-ignore
        const kind = gqlResponse?.data?.site?.data?.content?.kind?.code;
        if (kind) {
            rdl.content.object.kind = kind;
        }

        const breadcrumbs = gqlResponse?.data?.site?.data?.node?.breadcrumbs || [];
        if (breadcrumbs.length > 0) {
            rdl.context.publication_structure.root = (breadcrumbs[0].slug || '').toUpperCase();

            if (breadcrumbs.length > 1) {
                rdl.context.publication_structure.path = breadcrumbs.filter((elem, index) => index > 0).map(elem => elem?.slug).join('/').replaceAll('-', '_').toUpperCase();
                if (type === 'Story' && kind) {
                    rdl.context.publication_structure.path += `/${kind.toUpperCase()}`;
                }
            }
        }

        return rdl;
    }

    private mapType(type){
        const map =  {
            'Author': 'person',
            'CustomAction': 'wildcard',
            'SiteNode': 'list',
            'Source': 'contentsource',
            'Story': 'story',
            'Topic': 'topic',
        }
        return map[type];
    }


}
