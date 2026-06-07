import { Router } from 'express';
import { env } from '../config/env.js';

export const oidcRouter = Router();

// /.well-known/openid-configuration
// Fetched by every OIDC client library to discover endpoints automatically.
// All URLs are derived from OIDC_ISSUER — changing the issuer updates every pointer.
oidcRouter.get('/.well-known/openid-configuration', (_req, res) => {
  const issuer = env.OIDC_ISSUER;

  res.json({
    issuer,
    authorization_endpoint:                 `${issuer}/auth/authorize`,
    token_endpoint:                         `${issuer}/auth/token`,
    revocation_endpoint:                    `${issuer}/auth/revoke`,
    userinfo_endpoint:                      `${issuer}/api/me`,
    jwks_uri:                               `${issuer}/.well-known/jwks.json`,
    response_types_supported:               ['code'],
    subject_types_supported:                ['public'],
    id_token_signing_alg_values_supported:  ['HS256'],
    scopes_supported:                       ['openid', 'profile', 'email'],
    grant_types_supported:                  ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported:       ['S256'],
    token_endpoint_auth_methods_supported:  ['client_secret_post'],
  });
});

// /.well-known/jwks.json
// With HS256 (symmetric signing) there is no public key to publish.
// The endpoint must exist because every OIDC client expects it.
// Switch to RS256 and populate `keys` here to enable external token verification.
oidcRouter.get('/.well-known/jwks.json', (_req, res) => {
  res.json({ keys: [] });
});
