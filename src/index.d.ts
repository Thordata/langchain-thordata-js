export type SearchEngine =
  | "google"
  | "google_search"
  | "google_light"
  | "google_web"
  | "google_images"
  | "google_videos"
  | "google_news"
  | "google_shopping"
  | "google_local"
  | "google_places"
  | "google_product"
  | "google_lens"
  | "google_trends"
  | "google_maps"
  | "google_hotels"
  | "google_jobs"
  | "google_scholar"
  | "google_scholar_cite"
  | "google_scholar_author"
  | "google_play"
  | "google_play_product"
  | "google_play_games"
  | "google_play_movies"
  | "google_play_books"
  | "google_finance"
  | "google_finance_markets"
  | "google_flights"
  | "google_patents"
  | "google_patents_details"
  | "google_ai_mode"
  | "bing"
  | "bing_images"
  | "bing_videos"
  | "bing_news"
  | "bing_shopping"
  | "bing_maps"
  | "yandex"
  | "duckduckgo";

export type SearchParams = Record<string, unknown> & {
  engine?: SearchEngine | string;
  q?: string;
  query?: string;
  gl?: string;
  country?: string;
  hl?: string;
  language?: string;
  json?: string | number;
  isjson?: string | number | boolean;
};

export interface SearchResponse<T = unknown> {
  result: T;
  taskId: string | null;
  raw: Record<string, unknown> | unknown;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  filterParams?: boolean;
}

export interface ThorDataClientOptions {
  apiKey?: string;
  apiToken?: string;
  token?: string;
  apiUrl?: string;
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export declare const DEFAULT_API_URL: string;
export declare const DEFAULT_TIMEOUT_MS: number;
export declare const INTEGRATION_PLATFORM: string;
export declare const INTEGRATION_SOURCE: string;
export declare const REQUEST_PARAMETERS: ReadonlySet<string>;
export declare const SUPPORTED_ENGINES: readonly SearchEngine[];

export declare class ThorDataError extends Error {}
export declare class ThorDataConfigurationError extends ThorDataError {}
export declare class ThorDataConnectionError extends ThorDataError {}
export declare class ThorDataTimeoutError extends ThorDataConnectionError {}

export interface ThorDataAPIErrorOptions {
  code?: number | null;
  statusCode?: number | null;
  responseData?: unknown;
}

export declare class ThorDataAPIError extends ThorDataError {
  code: number | null;
  statusCode: number | null;
  responseData: unknown;
  constructor(message: string, options?: ThorDataAPIErrorOptions);
}

export declare class ThorDataAuthenticationError extends ThorDataAPIError {}
export declare class ThorDataPermissionError extends ThorDataAPIError {}
export declare class ThorDataRateLimitError extends ThorDataAPIError {}
export declare class ThorDataInvalidRequestError extends ThorDataAPIError {}
export declare class ThorDataNotCollectedError extends ThorDataAPIError {}

export declare class ThorDataClient {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly headers: Record<string, string>;

  constructor(options?: ThorDataClientOptions);
  toString(): string;
  request(
    method: string,
    path?: string,
    params?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Response>;
  search<T = unknown>(params?: SearchParams, options?: RequestOptions): Promise<T>;
  searchJson<T = unknown>(params?: SearchParams, options?: RequestOptions): Promise<T>;
  searchResponse<T = unknown>(params?: SearchParams, options?: RequestOptions): Promise<SearchResponse<T>>;
  rawSearch(params?: Record<string, unknown>, options?: RequestOptions): Promise<string>;
}

export declare const Client: typeof ThorDataClient;
export declare function search<T = unknown>(
  params?: SearchParams,
  options?: ThorDataClientOptions & RequestOptions,
): Promise<T>;
export declare function searchJson<T = unknown>(
  params?: SearchParams,
  options?: ThorDataClientOptions & RequestOptions,
): Promise<T>;
export declare function rawSearch(
  params?: Record<string, unknown>,
  options?: ThorDataClientOptions & RequestOptions,
): Promise<string>;

export interface ThorDataSearchToolOptions extends ThorDataClientOptions {
  client?: ThorDataClient;
}

export declare function createThorDataSearchTool(options?: ThorDataSearchToolOptions): unknown;
export declare const ThorDataSearchTool: typeof createThorDataSearchTool;
