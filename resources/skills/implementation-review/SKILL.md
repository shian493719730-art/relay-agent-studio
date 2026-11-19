---
name: implementation-review
description: Turn a software request into observable behavior and bounded validation without imposing a rigid template on simple changes.
---

# Review an implementation request

An independently written Relay guide, distributed under the repository MIT license.

Identify the trigger, the expected behavior, the affected data, and the existing constraints. Preserve the user's chosen interface and manual work unless they ask to change it.

Distinguish source inspection, a passing test, and an observed user journey. Propose checks that could reveal a real failure, especially loss of work, repeated execution, incorrect scope, and interruption behavior. Keep unknown integrations and unperformed checks explicit. Do not claim external actions were completed because a plan or a local simulation succeeded.

Use this guidance to improve the request. It does not run code or authorize deployment.
