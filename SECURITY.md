# Security

## Scope

Relay is an early, local single-user application bound to the loopback interface. It is not designed for direct public hosting, shared untrusted machines, or multi-tenant deployments. API credentials are stored in local server-side files, not an encrypted vault. See [data handling](docs/PRIVACY.md).

Only the latest development branch is maintained at present; no security response SLA is promised.

## Reporting

Use the repository Security tab's **Report a vulnerability** option if private reporting is available. If it is unavailable, open an issue containing only a request for a private reporting channel, without exploit steps, credentials, personal data or affected files; a maintainer can arrange a private channel. Do not post live keys or private runtime directories.

Please describe the affected version, platform, expected boundary, reproducible impact and a minimal sanitized example in the private report. Do not test against other people's systems or spend their API quota.

## Contributor checks

Keep runtime data and `.env.local` out of Git. Use mocked providers in CI, preserve same-origin/host restrictions and path/symlink checks, and propagate cancellation. Treat imported documents and remote Skill text as untrusted task material, never as permission to expand tools or publish data. Do not enable arbitrary shell or unrestricted browser access as an incidental feature.
