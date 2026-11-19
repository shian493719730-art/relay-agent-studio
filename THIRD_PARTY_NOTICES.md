# Third-party notices

The MIT license at the repository root covers Relay's original code, documentation and the original guides in `resources/skills`. It does not replace the terms of dependencies, external content or trademarks.

## Dependencies

Dependencies are installed by npm; see the exact versions in `package-lock.json` and each installed package's license files. The project uses, among others:

- Microsoft Playwright MCP and Model Context Protocol SDK for visible browser operations.
- React, Vite, TypeScript and tsx for the UI and tooling.
- Express, Zod and dotenv for the local service.
- OpenAI Agents packages and Anthropic AI SDK adapter for model integration.
- Mammoth, ExcelJS, PDF.js and yauzl for document handling.
- react-markdown and remark-gfm for rendered content.
- Lucide icons (ISC). The distributed icon license is retained at `public/design-v2/LUCIDE-LICENSE.txt`.

Dependency artifacts are not vendored into this repository. Redistributors who bundle dependencies must preserve their respective notices and license obligations, including PDF.js Apache-2.0 terms and any relevant transitive notices.

## Skill / workflow metadata

`resources/library` contains source pointers, classification and review metadata used for discovery. External source authors retain rights in their guides, code and documentation. Fetching a body for local use does not grant a right to redistribute it under MIT. Check the original repository/path and its license before copying, running or publishing that material. The catalog is not a certification of functionality, security, ownership or license compatibility.

## Brands and integrations

Provider names and recognizable identity marks identify configured services. They remain their respective owners' trademarks; no endorsement or affiliation is implied. Custom relays do not certify the identity of their upstream models.

Snapper Assist and Auth Relay are separate optional applications. Their source and application bundles are not included here. Only Relay's adapters are included.
