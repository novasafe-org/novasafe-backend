# Changelog

## v1.1.20

### Changed

feat(vault): item attachments NAS storage and documents delete harden

## v1.1.19

### Changed

fix(vault): persist MFA secret on item update

## v1.1.18

### Changed

feat(sharing): include revoked shares in sent list

## v1.1.17

### Changed

fix: share create 500 and invite emails

## v1.1.16

### Changed

feat(sharing): vault item sharing APIs for mobile Shared flow

## v1.1.15

### Changed

fix(documents): resolve upload MIME from filename when generic

## v1.1.14

### Changed

fix(ci): exclude *.test.ts from core tsc and drop import.meta

## v1.1.13

### Changed

feat(documents): NAS-backed storage and document update APIs

## v1.1.12

### Changed

feat(folders): persist folder color as hex

## v1.1.11

### Changed

feat(folders): flat vault folders and item folder APIs

## v1.1.10

### Changed

feat(auth): forgot password API, branded OTP emails, and UX hardening

## v1.1.9

### Changed

feat(auth): password reset verify step and proof token

## v1.1.8

### Changed

feat(auth): Google login vs register vs link (no email auto-merge)

## v1.1.7

### Changed

feat(auth): Google OAuth login flow — no auto signup

## v1.1.6

### Changed

feat(admin-api): Google Drive blog image proxy

## v1.1.5

### Changed

Service accounts and API tokens for blog automation

## v1.1.4

### Changed

Fix Mongoose schemas for esbuild Lambda bundles

## v1.1.3

### Changed

Auto-deploy mobile-api Lambda on master push

## v1.1.2

### Changed

Fix mobile-api Lambda: esbuild-only zip (no node_modules)

## v1.1.1

### Changed

Fix Lambda packaging: serverless-express in prod dependencies

## v1.1.0

### Added

NS-55 Feature flag platform

All notable changes to the NovaSafe Mobile API (`services/core`) are documented here.

Release versions are managed automatically by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/).

## v1.0.0

### Added

- Initial production Mobile API service
- `GET /version` build metadata endpoint
