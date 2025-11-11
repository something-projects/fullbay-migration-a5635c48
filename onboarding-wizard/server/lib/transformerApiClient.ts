import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Configuration for Transformer API client
 */
interface TransformerApiConfig {
  baseURL: string;
  timeout: number;
  enabled: boolean;
}

/**
 * Health check response from transformer service
 */
interface HealthCheckResponse {
  status: string;
  initialized: boolean;
  services: {
    database: string;
    vehicleMatcher: string;
    partsMatcher: string;
  };
  timestamp: string;
}

/**
 * Vehicle matching request payload
 */
interface VehicleMatchRequest {
  make: string;
  model: string;
  year: number;
  vin?: string;
}

/**
 * Vehicle matching response
 */
interface VehicleMatchResponse {
  success: boolean;
  matched: boolean;
  standardizedVehicle?: {
    make: string;
    model: string;
    year: number;
    bodyType?: string;
    engineBase?: string;
    confidence: number;
    matchType?: string;
    vcdbVehicleId?: number;
  };
  confidence: number;
  timestamp: string;
}

/**
 * Part matching request payload
 */
interface PartMatchRequest {
  partNumber: string;
  description?: string;
  manufacturer?: string;
}

/**
 * Part matching response
 */
interface PartMatchResponse {
  success: boolean;
  matched: boolean;
  standardizedPart?: {
    partNumber: string;
    description: string;
    manufacturer?: string;
    category?: string;
    confidence: number;
    matchType?: string;
    pcdbPartId?: number;
  };
  confidence: number;
  timestamp: string;
}

/**
 * Error response from transformer API
 */
interface TransformerApiError {
  error: string;
  message: string;
}

/**
 * Custom error class for transformer API errors
 */
class TransformerApiClientError extends Error {
  public statusCode: number;
  public apiError?: TransformerApiError;

  constructor(message: string, statusCode: number, apiError?: TransformerApiError) {
    super(message);
    this.name = 'TransformerApiClientError';
    this.statusCode = statusCode;
    this.apiError = apiError;
  }
}

/**
 * Client for communicating with the Transformer service matching APIs
 */
export class TransformerApiClient {
  private client: AxiosInstance;
  private config: TransformerApiConfig;

  constructor(config?: Partial<TransformerApiConfig>) {
    // Load configuration from environment variables with defaults
    this.config = {
      baseURL: config?.baseURL || process.env.TRANSFORMER_API_URL || 'http://transformer:3001',
      timeout: config?.timeout || parseInt(process.env.TRANSFORMER_API_TIMEOUT || '30000', 10),
      enabled: config?.enabled !== undefined ? config.enabled : (process.env.ENABLE_TRANSFORMER_API !== 'false')
    };

    // Create axios instance
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<TransformerApiError>) => {
        if (error.response) {
          // Server responded with error status
          throw new TransformerApiClientError(
            error.response.data?.message || error.message,
            error.response.status,
            error.response.data
          );
        } else if (error.request) {
          // Request made but no response received
          throw new TransformerApiClientError(
            'No response from transformer service',
            503
          );
        } else {
          // Error setting up request
          throw new TransformerApiClientError(
            error.message,
            500
          );
        }
      }
    );
  }

  /**
   * Check if the API is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check transformer service health and matcher availability
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    if (!this.config.enabled) {
      throw new TransformerApiClientError('Transformer API is disabled', 503);
    }

    const { data } = await this.client.get<HealthCheckResponse>('/health');
    return data;
  }

  /**
   * Match a single vehicle against AutoCare VCdb
   */
  async matchVehicle(request: VehicleMatchRequest): Promise<VehicleMatchResponse> {
    if (!this.config.enabled) {
      throw new TransformerApiClientError('Transformer API is disabled', 503);
    }

    const { data } = await this.client.post<VehicleMatchResponse>('/api/match/vehicle', request);
    return data;
  }

  /**
   * Match multiple vehicles in batch
   */
  async matchVehiclesBatch(requests: VehicleMatchRequest[]): Promise<VehicleMatchResponse[]> {
    if (!this.config.enabled) {
      throw new TransformerApiClientError('Transformer API is disabled', 503);
    }

    const { data } = await this.client.post<{ results: VehicleMatchResponse[] }>(
      '/api/match/vehicles/batch',
      { vehicles: requests }
    );
    return data.results;
  }

  /**
   * Match a single part against AutoCare PCdb
   */
  async matchPart(request: PartMatchRequest): Promise<PartMatchResponse> {
    if (!this.config.enabled) {
      throw new TransformerApiClientError('Transformer API is disabled', 503);
    }

    const { data } = await this.client.post<PartMatchResponse>('/api/match/part', request);
    return data;
  }

  /**
   * Match multiple parts in batch
   */
  async matchPartsBatch(requests: PartMatchRequest[]): Promise<PartMatchResponse[]> {
    if (!this.config.enabled) {
      throw new TransformerApiClientError('Transformer API is disabled', 503);
    }

    const { data } = await this.client.post<{ results: PartMatchResponse[] }>(
      '/api/match/parts/batch',
      { parts: requests }
    );
    return data.results;
  }
}

// Export singleton instance
export const transformerApiClient = new TransformerApiClient();

// Export types for use in other modules
export type {
  TransformerApiConfig,
  HealthCheckResponse,
  VehicleMatchRequest,
  VehicleMatchResponse,
  PartMatchRequest,
  PartMatchResponse,
  TransformerApiError
};

export { TransformerApiClientError };
