import {
  createImportMap,
  createCSSModulesImportMap,
  getImports,
  hasImports,
  isModuleScript,
  removeImports,
} from '../compiler';
import { cssPresets, getLanguageCompiler, getLanguageExtension } from '../languages';
import type { Cache, EditorId, Config, CompileInfo } from '../models';
import { getAppCDN, modulesService } from '../services';
// eslint-disable-next-line import/no-internal-modules
import { testImports } from '../toolspane/test-imports';
import { escapeScript, getAbsoluteUrl, isRelativeUrl, objectMap, toDataUrl } from '../utils';
import { esModuleShimsPath, browserJestUrl, spacingJsUrl } from '../vendors';

export const createResultPage = async ({
  code,
  config,
  forExport,
  template,
  baseUrl,
  singleFile,
  runTests,
  compileInfo,
}: {
  code: Cache;
  config: Config;
  forExport: boolean;
  template: string;
  baseUrl: string;
  singleFile: boolean;
  runTests: boolean;
  compileInfo: CompileInfo;
}): Promise<string> => {
  const absoluteBaseUrl = getAbsoluteUrl(baseUrl);

  const domParser = new DOMParser();
  const dom = domParser.parseFromString(template, 'text/html');

  // if export => clean, else => add utils
  if (forExport) {
    dom.querySelector('script')?.remove();
  } else {
    const utilsScript = dom.createElement('script');
    utilsScript.src = absoluteBaseUrl + '{{hash:result-utils.js}}';
    utilsScript.dataset.env = 'development';
    dom.head.appendChild(utilsScript);
  }

  // title
  dom.title = config.title;

  // html classes
  if (config.customSettings.htmlClasses) {
    dom.documentElement.classList.add(...config.customSettings.htmlClasses.split(' '));
  }

  // head content
  if (config.customSettings.head) {
    dom.head.innerHTML += config.customSettings.head;
  }

  // CSS Preset
  if (config.cssPreset) {
    const presetUrl = cssPresets.find((preset) => preset.id === config.cssPreset)?.url;
    if (presetUrl) {
      const cssPreset = dom.createElement('link');
      cssPreset.rel = 'stylesheet';
      cssPreset.id = '__livecodes__css-preset';
      cssPreset.href = getAbsoluteUrl(presetUrl, absoluteBaseUrl);
      dom.head.appendChild(cssPreset);
    }
  }

  // external stylesheets
  config.stylesheets.forEach((url) => {
    const stylesheet = dom.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = url;
    dom.head.appendChild(stylesheet);
  });

  // stylesheets imported in script editor
  const stylesheetImports = getImports(code.script.compiled).filter(
    (mod) => mod.endsWith('.css') && !mod.startsWith('.'),
  );
  stylesheetImports.forEach((mod) => {
    const url = modulesService.getUrl(mod);
    const stylesheet = dom.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = url;
    dom.head.appendChild(stylesheet);
  });
  code.script.compiled = removeImports(code.script.compiled, stylesheetImports);

  // editor styles
  if (singleFile) {
    const style = code.style.compiled;
    const styleElement = dom.createElement('style');
    styleElement.id = '__livecodes_styles__';
    styleElement.innerHTML = style;
    dom.head.appendChild(styleElement);
  } else {
    const EditorStylesheet = dom.createElement('link');
    EditorStylesheet.rel = 'stylesheet';
    EditorStylesheet.href = './style.css';
    dom.head.appendChild(EditorStylesheet);
  }

  // editor markup
  const markup = code.markup.compiled;
  dom.body.innerHTML += markup;

  // cleanup custom configurations and scripts
  if (code.script.language === 'blockly') {
    const extra = dom.querySelectorAll(
      'script[type="blockly/script"], script[data-type="blockly/script"], xml[type="blockly/xml"], xml[data-type="blockly/xml"]',
    );
    extra.forEach((el) => el.remove());
  }

  // runtime styles & scripts
  const runtimeDependencies = (['markup', 'style', 'script'] as EditorId[]).map(
    (editorId: EditorId) => ({
      language: code[editorId].language,
      compiled: code[editorId].compiled,
    }),
  );

  const compiledTests = runTests ? code.tests?.compiled || '' : '';

  const importFromScript =
    getImports(markup).includes('./script') ||
    (runTests && !forExport && getImports(compiledTests).includes('./script'));

  let compilerImports = {};

  for (const { language, compiled } of runtimeDependencies) {
    const compiler = getLanguageCompiler(language);
    if (!compiler) continue;

    const compilerStyles =
      typeof compiler.styles === 'function'
        ? compiler.styles({ compiled, baseUrl: absoluteBaseUrl, config })
        : compiler.styles || [];
    compilerStyles.forEach((depStyleUrl) => {
      const stylesheet = dom.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = isRelativeUrl(depStyleUrl) ? absoluteBaseUrl + depStyleUrl : depStyleUrl;
      dom.head.appendChild(stylesheet);
    });
    const compilerScripts =
      typeof compiler.scripts === 'function'
        ? compiler.scripts({ compiled, baseUrl: absoluteBaseUrl, config })
        : compiler.scripts || [];
    compilerScripts.forEach((depScriptUrl) => {
      const depScript = dom.createElement('script');
      depScript.src = isRelativeUrl(depScriptUrl) ? absoluteBaseUrl + depScriptUrl : depScriptUrl;
      if (compiler.deferScripts) {
        depScript.defer = true;
      }
      if (depScriptUrl.includes('-script-esm.')) {
        depScript.type = 'module';
      }
      dom.head.appendChild(depScript);
    });
    if (compiler.inlineScript) {
      if (typeof compiler.inlineScript === 'function') {
        compiler.inlineScript = await compiler.inlineScript({
          baseUrl,
        });
      }
      const inlineScript = document.createElement('script');
      inlineScript.innerHTML = compiler.inlineScript;
      dom.head.appendChild(inlineScript);
    }
    if (compiler.imports) {
      compilerImports = {
        ...compilerImports,
        ...objectMap(compiler.imports, (url) => getAbsoluteUrl(url, baseUrl)),
      };
    }
  }

  const styleExtension = getLanguageExtension(code.style.language);

  // import maps
  const userImports =
    config.customSettings.mapImports === false
      ? {}
      : {
          ...(hasImports(code.script.compiled)
            ? createImportMap(code.script.compiled, config)
            : {}),
          ...(hasImports(code.markup.compiled)
            ? createImportMap(code.markup.compiled, config)
            : {}),
          ...(runTests && !forExport && hasImports(compiledTests)
            ? createImportMap(compiledTests, config)
            : {}),
          ...(importFromScript ? { './script': toDataUrl(code.script.compiled) } : {}),
          ...createCSSModulesImportMap(
            code.script.compiled,
            code.style.compiled,
            compileInfo.cssModules,
            styleExtension,
          ),
          ...createCSSModulesImportMap(
            code.markup.compiled,
            code.style.compiled,
            compileInfo.cssModules,
            styleExtension,
          ),
          ...compileInfo.imports,
        };

  const importMaps = {
    ...userImports,
    ...compilerImports,
    ...(runTests ? testImports : {}),
    ...config.imports,
    ...config.customSettings.imports,
  };
  if (Object.keys(importMaps).length > 0) {
    const esModuleShims = dom.createElement('script');
    esModuleShims.src = modulesService.getUrl(esModuleShimsPath, getAppCDN());
    esModuleShims.async = true;
    dom.head.appendChild(esModuleShims);

    const importMapsScript = dom.createElement('script');
    importMapsScript.type = 'importmap';
    importMapsScript.innerHTML = `{"imports": ${JSON.stringify(importMaps, null, 2)}}`;
    dom.head.appendChild(importMapsScript);
  }

  // external scripts
  config.scripts.forEach((url) => {
    const externalScript = dom.createElement('script');
    externalScript.src = url;
    dom.head.appendChild(externalScript);
  });

  if (!importFromScript) {
    // editor script
    const script = code.script.compiled;
    const scriptElement = dom.createElement('script');
    if (singleFile) {
      scriptElement.innerHTML = escapeScript(script);
    } else {
      scriptElement.src = './script.js';
    }
    dom.body.appendChild(scriptElement);

    // script type
    const scriptType = getLanguageCompiler(code.script.language)?.scriptType;
    if (scriptType) {
      scriptElement.type = scriptType;
    } else if (config.customSettings.scriptType != null) {
      // do not add type if scriptType === ''
      if (config.customSettings.scriptType) {
        scriptElement.type = config.customSettings.scriptType;
      }
    } else if (isModuleScript(script)) {
      scriptElement.type = 'module';
    }
  }

  // spacing
  if (config.showSpacing && !forExport) {
    const spacingScript = dom.createElement('script');
    spacingScript.src = spacingJsUrl;
    spacingScript.dataset.env = 'development';
    dom.body.appendChild(spacingScript);
  }

  // tests
  if (runTests && !forExport) {
    const jestScript = dom.createElement('script');
    jestScript.src = browserJestUrl;
    jestScript.dataset.env = 'development';
    dom.body.appendChild(jestScript);

    const testScript = dom.createElement('script');
    testScript.type = 'module';
    testScript.dataset.env = 'development';
    testScript.innerHTML = `
const {afterAll, afterEach, beforeAll, beforeEach, describe, fdescribe, xdescribe, it, test, fit, xtest, xit, expect, jest} = window.browserJest;
${escapeScript(compiledTests)}

window.browserJest.run().then(results => {
  parent.postMessage({type: 'testResults', payload: {results: results.testResults }}, '*');
}).catch((error) => {
  parent.postMessage({type: 'testResults', payload: {error: error.message || String(error)}}, '*');
});
    `;
    dom.body.appendChild(testScript);
  }

  return '<!DOCTYPE html>\n' + dom.documentElement.outerHTML;
};

export const cleanResultFromDev = (result: string) => {
  const resultDOM = new DOMParser().parseFromString(result, 'text/html');
  const elements = resultDOM.querySelectorAll('[data-env="development"]');
  elements.forEach((el) => {
    el.remove();
  });
  return resultDOM.documentElement.outerHTML;
};
