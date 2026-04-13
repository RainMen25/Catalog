"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const requestHelper = (request, reject) => {
    request.on("error", error => reject(error));
    request.end();
};
const responseHandler = (response, resolve, reject) => {
    let chunks = [];
    response.on("data", data => chunks.push(data));
    response.on("end", () => resolve(Buffer.concat(chunks)));
    response.on("error", error => reject(error));
};
const request = (url, options, body) => {
    let apiUrl = new URL(url);
    let apiClient = apiUrl.protocol.toLowerCase() === "http:" ? http_1.default : https_1.default;
    return new Promise((resolve, reject) => {
        let request = apiClient.request(apiUrl.href, {
            ...{
                rejectUnauthorized: false,
            },
            ...options,
        }, response => {
            responseHandler(response, resolve, reject);
        });
        if (body)
            request.write(body);
        requestHelper(request, reject);
    });
};
exports.request = request;
//# sourceMappingURL=http-proxy.js.map