"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tts = exports.translate = void 0;
const httpProxy = __importStar(require("../util/http-proxy"));
const apiDomain = "https://translate.googleapis.com";
const translatePath = "/translate_a/single";
const translateDefaultQuery = new Map([
    ["client", "gtx"],
    ["dj", "1"],
    // input encoding
    ["ie", "utf8"],
    // output encoding
    ["oe", "utf8"],
    // dictionary
    ["dt", ["t", "rm", "bd", "ex", "md", "ss", "at"]],
]);
const ttsPath = "/translate_tts";
const ttsDefaultQuery = new Map([
    ["client", "gtx"],
    // input encoding
    ["ie", "utf8"],
]);
const createQuery = (query) => {
    let params = [];
    query.forEach((v, k) => {
        if (Array.isArray(v)) {
            v.forEach(i => params.push(`${k}=${i}`));
        }
        else {
            params.push(`${k}=${v}`);
        }
    });
    return params.join("&");
};
const transParam = (item) => {
    return new Map([
        ["q", encodeURIComponent(item.q)],
        ["sl", item.sl],
        ["tl", item.tl],
        // dictionary language
        ["hl", item.tl],
    ]);
};
const generateRequest = (path) => {
    return httpProxy.request(`${apiDomain}${path}`, {
        method: "GET",
    });
};
const translate = (item) => {
    let path = `${translatePath}?${createQuery(new Map([...translateDefaultQuery, ...transParam(item)]))}`;
    return new Promise((resolve, reject) => {
        generateRequest(path).then(data => {
            let result = JSON.parse(data.toString());
            resolve(convertToTranslateResult(item, result));
        }).catch(e => reject(e));
    });
};
exports.translate = translate;
const tts = (item) => {
    let path = `${ttsPath}?${createQuery(new Map([...ttsDefaultQuery, ...transParam(item)]))}`;
    return new Promise((resolve, reject) => {
        generateRequest(path).then(data => resolve(data)).catch(e => reject(e));
    });
};
exports.tts = tts;
const convertToTranslateResult = (item, apiResult) => {
    let result = {
        item,
        defaultResult: "",
        alternative: [],
        sourceLanguage: apiResult.src,
        dictionary: [],
        definition: [],
        example: [],
    };
    let srcPronounce = apiResult.sentences?.filter(i => i.src_translit).map(i => i.src_translit) ?? [];
    if (srcPronounce?.length > 0)
        result.sourcePronounce = srcPronounce[0];
    let targetPronounce = apiResult.sentences?.filter(i => i.translit).map(i => i.translit) ?? [];
    if (targetPronounce?.length > 0)
        result.targetPronounce = targetPronounce[0];
    result.defaultResult = apiResult?.sentences?.map(i => i?.trans ?? "").join("") ?? "";
    if (apiResult?.alternative_translations) {
        apiResult.alternative_translations?.forEach(i => {
            if (i.alternative && i.alternative.length > 0) {
                result.alternative.push(i.alternative.filter(j => j.word_postproc).map(j => j.word_postproc));
            }
        });
    }
    apiResult.definitions?.forEach(i => {
        result.definition.push({
            pos: i.pos,
            entry: i.entry?.map(j => {
                return {
                    gloss: j.gloss,
                    example: j.example,
                    synonym: apiResult.synsets?.map(k => (k.pos === i.pos ? (k.entry ?? []) : []))
                        .reduce((p, c) => [...p, ...c], [])
                        .map(h => h.definition_id === j.definition_id ? (h.synonym ?? []) : [])
                        .reduce((p, c) => [...p, ...c], [])
                        ?? []
                };
            }) ?? []
        });
    });
    apiResult.dict?.forEach(i => {
        result.dictionary.push({
            pos: i.pos,
            entry: i.entry?.map(i => {
                return {
                    word: i.word,
                    reserve: i.reverse_translation ?? []
                };
            }) ?? []
        });
    });
    result.example = apiResult.examples?.example?.filter(i => i.text).map(i => {
        return {
            source: i.text
        };
    }) ?? [];
    if (result?.sourceLanguage)
        result.item.sl = result.sourceLanguage;
    result.item.results = [];
    if (result.alternative?.length === 1) {
        result.alternative[0].forEach(i => result.item.results?.push(i));
    }
    else {
        result.item.results?.push(result.defaultResult);
    }
    return result;
};
//# sourceMappingURL=google-api.js.map