# Changelog

## v1.1.37

### Changed

feat(auth): device fingerprinting and silent session resume scaffold

## v1.1.36

### Changed

fix(devices): soft-delete list filter and Not-me rejection path

## v1.1.35

### Changed

feat(devices): revoke all sessions and remove all devices

## v1.1.34

### Changed

feat(devices): new-device login consent (pending trust + It's me / Not me)

## v1.1.33

### Changed

feat(cards): Cards v1 backend — APIs, encryption, share

## v1.1.32

### Changed

feat(devices): login limits and FCM push alerts

## v1.1.31

### Changed

Add web email account deletion for the landing page.

## v1.1.30

### Changed

feat(subscriptions): Free/Pro slot limits and plan gates

## v1.1.29

### Changed

feat(auth): mobile dual-token sessions with rotation, step-up, and attestation

## v1.1.28

### Changed

fix: set hasLinkedAuthenticator on dashboard items for recently-used 2FA

## v1.1.27

### Changed

fix(sharing): include revoked shares in received list

## v1.1.26

### Changed

fix(authenticator): cascade soft-delete for linked 2FA and vault items

## v1.1.25

### Changed

fix(authenticator): fix backfill TypeScript error breaking Lambda CI

## v1.1.24

### Changed

fix(authenticator): backfill vault MFA into list so screen is not empty

## v1.1.23

### Changed

fix(authenticator): restore Lambda cold start (partial index)

## v1.1.22

### Changed

feat: authenticator module, appFreeOverride limits, and revoked share access

## v1.1.21

### Changed

feat: appFreeOverride free limits and revoked share ACCESS_REVOKED enforcement

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
