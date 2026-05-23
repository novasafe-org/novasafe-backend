import { playgroundConfig, type PlaygroundEnvironment } from '../config/playground.config';

export class EnvironmentRegistry {
  private readonly environments: Map<string, PlaygroundEnvironment>;

  constructor(environments: PlaygroundEnvironment[] = playgroundConfig.environments) {
    this.environments = new Map(environments.map((env) => [env.id, env]));
  }

  list(): PlaygroundEnvironment[] {
    return [...this.environments.values()];
  }

  get(id: string | undefined): PlaygroundEnvironment | undefined {
    if (!id) return this.environments.get('local') ?? this.environments.values().next().value;
    return this.environments.get(id);
  }

  resolveCoreUrl(environmentId: string | undefined): string {
    const env = this.get(environmentId);
    return env?.coreUrl ?? playgroundConfig.defaultCoreUrl;
  }

  resolveOpenapiUrl(environmentId: string | undefined): string {
    const env = this.get(environmentId);
    if (env?.openapiUrl) return env.openapiUrl;
    const base = env?.coreUrl ?? playgroundConfig.defaultCoreUrl;
    return `${base.replace(/\/$/, '')}/api/v1/openapi.json`;
  }
}

export const environmentRegistry = new EnvironmentRegistry();
