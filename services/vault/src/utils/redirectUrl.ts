// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedirectUrl = void 0;
const getRedirectConfig = () => {
    const vaultPath = process.env.VAULT_PATH || '/vault';
    const appOrigin = process.env.APP_ORIGIN?.replace(/\/$/, '');
    return {
        baseDomain: process.env.BASE_DOMAIN || 'novasafe.io',
        individualSubdomain: process.env.INDIVIDUAL_SUBDOMAIN || 'app',
        vaultPath,
        protocol: process.env.PROTOCOL || 'https',
        appOrigin,
    };
};
const getRedirectUrl = (planId, companyName) => {
    const config = getRedirectConfig();
    const plan = (planId || 'individual').toLowerCase();
    const protocol = config.protocol || 'https';
    if (config.appOrigin) {
        return `${config.appOrigin}${config.vaultPath}`;
    }
    if (plan === 'individual' || plan === 'family') {
        return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
    }
    if (plan === 'team' || plan === 'business') {
        if (!companyName) {
            return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
        }
        const normalizedCompany = companyName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return `${protocol}://${normalizedCompany}.${config.baseDomain}${config.vaultPath}`;
    }
    return `${protocol}://${config.individualSubdomain}.${config.baseDomain}${config.vaultPath}`;
};
exports.getRedirectUrl = getRedirectUrl;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const getRedirectUrl = __cjs_exports.getRedirectUrl;
