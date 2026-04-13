"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderWelcomeLeadEmail = renderWelcomeLeadEmail;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const __dirname = (0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url));
function renderWelcomeLeadEmail(params) {
    const htmlTemplate = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '../welcome-lead-email.html'), 'utf8');
    const textTemplate = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '../welcome-lead-email.txt'), 'utf8');
    const replacements = {
        '{{first_name}}': params.firstName,
        '{{contract_link}}': params.contractLink
    };
    const apply = (input) => Object.entries(replacements).reduce((acc, [key, value]) => acc.split(key).join(value), input);
    return {
        subject: 'Welcome to CredX — Here’s Your Next Step',
        html: apply(htmlTemplate),
        text: apply(textTemplate)
    };
}
