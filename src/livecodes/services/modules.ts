import type { CDN } from '../models';

declare const globalThis: { cdn: CDN };

const moduleCDN: CDN = 'jspm';
const npmCDN: CDN = 'unpkg';
const ghCDN: CDN = 'jsdelivr.gh';

export const modulesService = {
  getModuleUrl: (
    moduleName: string,
    { isModule = true, defaultCDN = 'jspm' }: { isModule?: boolean; defaultCDN?: CDN } = {},
  ) => {
    moduleName = moduleName.replace(/#nobundle/g, '');

    const moduleUrl = getCdnUrl(moduleName, isModule, defaultCDN);
    if (moduleUrl) {
      return moduleUrl;
    }

    return isModule
      ? 'https://jspm.dev/' + moduleName
      : 'https://cdn.jsdelivr.net/npm/' + moduleName;
  },

  getUrl: (path: string, cdn?: CDN) =>
    path.startsWith('http') ? path : getCdnUrl(path, false, cdn || getCdnParam()) || path,

  cdnList: { npm: ['unpkg', 'jsdelivr', 'statically'], module: ['jspm', 'skypack'] },
};

export const getCdnParam = (): CDN => {
  if (globalThis.cdn) return globalThis.cdn;
  try {
    const url = new URL(location.href);
    return (url.searchParams.get('cdn') as CDN) || modulesService.cdnList.npm[0];
  } catch {
    return modulesService.cdnList.npm[0] as CDN;
  }
};

const getCdnUrl = (modName: string, isModule: boolean, defaultCDN?: CDN) => {
  const post = isModule && modName.startsWith('unpkg:') ? '?module' : '';
  if (modName.startsWith('gh:')) {
    modName = modName.replace('gh', ghCDN);
  } else if (!modName.includes(':')) {
    const prefix = defaultCDN || (isModule ? moduleCDN : npmCDN);
    modName = prefix + ':' + modName;
  }
  for (const i of TEMPLATES) {
    const [pattern, template] = i;
    if (pattern.test(modName)) {
      return modName.replace(pattern, template) + post;
    }
  }
  return null;
};

// based on https://github.com/neoascetic/rawgithack/blob/master/web/rawgithack.js
const TEMPLATES: Array<[RegExp, string]> = [
  [/^(jspm:)(.+)/i, 'https://jspm.dev/$2'],

  [/^(npm:)(.+)/i, 'https://jspm.dev/$2'],

  [/^(node:)(.+)/i, 'https://jspm.dev/$2'],

  [/^(skypack:)(.+)/i, 'https://cdn.skypack.dev/$2'],

  [/^(jsdelivr:)(.+)/i, 'https://cdn.jsdelivr.net/npm/$2'],

  [/^(jsdelivr.gh:)(.+)/i, 'https://cdn.jsdelivr.net/gh/$2'],

  [/^(statically:)(.+)/i, 'https://cdn.statically.io/gh/$2'],

  [/^(esm.run:)(.+)/i, 'https://esm.run/$2'],

  [/^(esm.sh:)(.+)/i, 'https://esm.sh/$2'],

  [/^(esbuild:)(.+)/i, 'https://esbuild.vercel.app/$2'],

  [/^(bundle.run:)(.+)/i, 'https://bundle.run/$2'],

  [/^(unpkg:)(.+)/i, 'https://unpkg.com/$2'],

  [/^(bundlejs:)(.+)/i, 'https://deno.bundlejs.com/?file&q=$2'],

  [/^(bundle:)(.+)/i, 'https://deno.bundlejs.com/?file&q=$2'],

  [/^(deno:)(.+)/i, 'https://deno.bundlejs.com/?file&q=https://deno.land/x/$2/mod.ts'],

  [/^(https:\/\/deno\.land\/.+)/i, 'https://deno.bundlejs.com/?file&q=$1'],

  [
    /^(github:|https:\/\/github\.com\/)(.[^\/]+?)\/(.[^\/]+?)\/(?!releases\/)(?:(?:blob|raw)\/)?(.+?\/.+)/i,
    'https://deno.bundlejs.com/?file&q=https://cdn.jsdelivr.net/gh/$2/$3@$4',
  ],

  [/^(gist\.github:)(.+?\/[0-9a-f]+\/raw\/(?:[0-9a-f]+\/)?.+)$/i, 'https://gist.githack.com/$2'],

  [
    /^(gitlab:|https:\/\/gitlab\.com\/)([^\/]+.*\/[^\/]+)\/(?:raw|blob)\/(.+?)(?:\?.*)?$/i,
    'https://deno.bundlejs.com/?file&q=https://gl.githack.com/$2/raw/$3',
  ],
  [
    /^(bitbucket:|https:\/\/bitbucket\.org\/)([^\/]+\/[^\/]+)\/(?:raw|src)\/(.+?)(?:\?.*)?$/i,
    'https://deno.bundlejs.com/?file&q=https://bb.githack.com/$2/raw/$3',
  ],

  // snippet file URL from web interface, with revision
  [
    /^(bitbucket:)snippets\/([^\/]+\/[^\/]+)\/revisions\/([^\/\#\?]+)(?:\?[^#]*)?(?:\#file-(.+?))$/i,
    'https://bb.githack.com/!api/2.0/snippets/$2/$3/files/$4',
  ],
  // snippet file URL from web interface, no revision
  [
    /^(bitbucket:)snippets\/([^\/]+\/[^\/\#\?]+)(?:\?[^#]*)?(?:\#file-(.+?))$/i,
    'https://bb.githack.com/!api/2.0/snippets/$2/HEAD/files/$3',
  ],
  // snippet file URLs from REST API
  [
    /^(bitbucket:)\!api\/2.0\/snippets\/([^\/]+\/[^\/]+\/[^\/]+)\/files\/(.+?)(?:\?.*)?$/i,
    'https://bb.githack.com/!api/2.0/snippets/$2/files/$3',
  ],
  [
    /^(api\.bitbucket:)2.0\/snippets\/([^\/]+\/[^\/]+\/[^\/]+)\/files\/(.+?)(?:\?.*)?$/i,
    'https://bb.githack.com/!api/2.0/snippets/$2/files/$3',
  ],

  [/^(rawgit:)(.+?\/[0-9a-f]+\/raw\/(?:[0-9a-f]+\/)?.+)$/i, 'https://gist.githack.com/$2'],
  [
    /^(rawgit:|https:\/\/raw\.githubusercontent\.com)(\/[^\/]+\/[^\/]+|[0-9A-Za-z-]+\/[0-9a-f]+\/raw)\/(.+)/i,
    'https://deno.bundlejs.com/?file&q=https://raw.githack.com/$2/$3',
  ],
];
