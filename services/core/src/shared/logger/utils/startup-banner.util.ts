import os from 'os';
import { colorize } from './color.util';

export type StartupBannerDatabase = {
  state?: string;
  ready?: boolean;
  dbName?: string;
  host?: string;
};

export type StartupBannerOptions = {
  port: number;
  bind?: string;
  serviceName: string;
  environment: string;
  enableColors?: boolean;
  database?: StartupBannerDatabase;
  logLevel?: string;
};

const isIPv4 = (family: string | number): boolean =>
  family === 'IPv4' || family === 4;

/** Non-loopback IPv4 addresses on this machine (LAN, VPN, etc.). */
export const getLocalNetworkAddresses = (): string[] => {
  const addresses = new Set<string>();
  const nets = os.networkInterfaces();

  for (const interfaces of Object.values(nets)) {
    for (const net of interfaces ?? []) {
      if (isIPv4(net.family) && !net.internal) {
        addresses.add(net.address);
      }
    }
  }

  return [...addresses].sort();
};

/** Host labels shown in the startup banner (deduped, stable order). */
export const getStartupHostLabels = (port: number): string[] => {
  const labels = ['localhost', '127.0.0.1', ...getLocalNetworkAddresses()];
  return [...new Set(labels)];
};

export const formatHostUrl = (
  host: string,
  port: number,
  protocol: 'http' | 'https' = 'http',
): string => `${protocol}://${host}:${port}`;

export const getStartupHostUrls = (
  port: number,
  protocol: 'http' | 'https' = 'http',
): string[] => getStartupHostLabels(port).map((host) => formatHostUrl(host, port, protocol));

/**
 * Fancy one-shot startup banner (stdout). Normal Winston logging continues after this.
 */
export const printServerStartupBanner = (options: StartupBannerOptions): void => {
  const {
    port,
    bind = '0.0.0.0',
    serviceName,
    environment,
    enableColors = true,
    database,
    logLevel,
  } = options;

  const c = (color: Parameters<typeof colorize>[0], text: string) =>
    colorize(color, text, enableColors);

  const urls = getStartupHostUrls(port);
  const width = 58;
  const border = c('cyan', '═'.repeat(width));
  const side = c('cyan', '║');
  const title = 'happy hacking';
  const titlePad = Math.max(0, Math.floor((width - title.length) / 2));
  const titleRightPad = Math.max(0, width - title.length - titlePad);
  const titleLine =
    `${side}${' '.repeat(titlePad)}${c('bold', title)}${' '.repeat(titleRightPad)}${side}`;

  const lines: string[] = [
    '',
    c('cyan', `╔${'═'.repeat(width)}╗`),
    titleLine,
    c('cyan', `╚${'═'.repeat(width)}╝`),
    '',
    `  ${c('green', '▸')} ${c('bold', serviceName)} ${c('gray', `— ${environment}`)}`,
    '',
    `  ${c('yellow', 'Server started')} ${c('gray', '— reach it at:')}`,
    '',
    ...urls.map((url) => `    ${c('green', '▸')} ${c('cyan', url)}`),
    '',
    `  ${c('gray', `Bound on ${bind}:${port}`)}`,
  ];

  if (database?.dbName || database?.host) {
    const dbState = database.ready ? c('green', 'connected') : c('yellow', database.state ?? 'pending');
    const dbLabel = [database.dbName, database.host].filter(Boolean).join(' @ ');
    lines.push('', `  ${c('gray', 'Database:')} ${dbLabel} ${c('gray', `(${dbState})`)}`);
  }

  if (logLevel) {
    lines.push(`  ${c('gray', 'Log level:')} ${logLevel}`);
  }

  lines.push('', border, '');

  // eslint-disable-next-line no-console -- intentional startup art; not routed through Winston
  console.log(lines.join('\n'));
};
