/**
 * Circuit Breaker Service
 * 
 * Prevents cascading failures by stopping requests to a failing service.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, immediately return fallback
 * - HALF_OPEN: Testing if service recovered, allow limited requests
 */

export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
    failureThreshold: number;      // Number of failures to open circuit
    successThreshold: number;      // Successes in half-open to close circuit
    resetTimeoutMs: number;        // Time before trying half-open
    halfOpenMaxRequests: number;   // Max requests in half-open state
}

interface CircuitBreakerState {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    halfOpenRequests: number;
}

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeoutMs: 30000,  // 30 seconds
    halfOpenMaxRequests: 3,
};

// Circuit breakers per provider
const circuits: Map<string, CircuitBreakerState> = new Map();
const configs: Map<string, CircuitBreakerConfig> = new Map();

/**
 * Get or initialize circuit state for a provider
 */
function getCircuit(provider: string): CircuitBreakerState {
    let circuit = circuits.get(provider);
    if (!circuit) {
        circuit = {
            state: CircuitState.CLOSED,
            failures: 0,
            successes: 0,
            lastFailureTime: 0,
            halfOpenRequests: 0,
        };
        circuits.set(provider, circuit);
    }
    return circuit;
}

/**
 * Get configuration for a provider
 */
function getConfig(provider: string): CircuitBreakerConfig {
    return configs.get(provider) || DEFAULT_CONFIG;
}

/**
 * Configure circuit breaker for a provider
 */
export function configureCircuitBreaker(
    provider: string,
    config: Partial<CircuitBreakerConfig>
): void {
    configs.set(provider, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Check if a request can proceed
 * Returns true if request should proceed, false if circuit is open
 * 
 * @param provider - The service provider (e.g., 'nvidia')
 * @returns Whether the request can proceed
 */
export function canProceed(provider: string = 'nvidia'): boolean {
    const circuit = getCircuit(provider);
    const config = getConfig(provider);
    const now = Date.now();

    switch (circuit.state) {
        case CircuitState.CLOSED:
            return true;

        case CircuitState.OPEN:
            // Check if reset timeout has passed
            if (now - circuit.lastFailureTime >= config.resetTimeoutMs) {
                console.log(`[CircuitBreaker] ${provider}: OPEN -> HALF_OPEN (timeout passed)`);
                circuit.state = CircuitState.HALF_OPEN;
                circuit.halfOpenRequests = 0;
                circuit.successes = 0;
                return true;
            }
            console.log(`[CircuitBreaker] ${provider}: OPEN - request blocked`);
            return false;

        case CircuitState.HALF_OPEN:
            // Allow limited requests in half-open state
            if (circuit.halfOpenRequests < config.halfOpenMaxRequests) {
                circuit.halfOpenRequests++;
                return true;
            }
            console.log(`[CircuitBreaker] ${provider}: HALF_OPEN - max requests reached`);
            return false;

        default:
            return true;
    }
}

/**
 * Record a successful request
 * 
 * @param provider - The service provider
 */
export function recordSuccess(provider: string = 'nvidia'): void {
    const circuit = getCircuit(provider);
    const config = getConfig(provider);

    switch (circuit.state) {
        case CircuitState.CLOSED:
            // Reset failure count on success
            circuit.failures = 0;
            break;

        case CircuitState.HALF_OPEN:
            circuit.successes++;
            if (circuit.successes >= config.successThreshold) {
                console.log(`[CircuitBreaker] ${provider}: HALF_OPEN -> CLOSED (recovered)`);
                circuit.state = CircuitState.CLOSED;
                circuit.failures = 0;
                circuit.successes = 0;
                circuit.halfOpenRequests = 0;
            }
            break;

        case CircuitState.OPEN:
            // Shouldn't happen, but reset just in case
            break;
    }
}

/**
 * Record a failed request
 * 
 * @param provider - The service provider
 * @param isTransient - Whether this is a transient error (rate limit, network)
 */
export function recordFailure(provider: string = 'nvidia', isTransient: boolean = true): void {
    const circuit = getCircuit(provider);
    const config = getConfig(provider);
    const now = Date.now();

    switch (circuit.state) {
        case CircuitState.CLOSED:
            circuit.failures++;
            circuit.lastFailureTime = now;
            if (circuit.failures >= config.failureThreshold) {
                console.log(`[CircuitBreaker] ${provider}: CLOSED -> OPEN (${circuit.failures} failures)`);
                circuit.state = CircuitState.OPEN;
            }
            break;

        case CircuitState.HALF_OPEN:
            // Any failure in half-open immediately opens the circuit
            console.log(`[CircuitBreaker] ${provider}: HALF_OPEN -> OPEN (failure during test)`);
            circuit.state = CircuitState.OPEN;
            circuit.lastFailureTime = now;
            circuit.halfOpenRequests = 0;
            break;

        case CircuitState.OPEN:
            // Update last failure time
            circuit.lastFailureTime = now;
            break;
    }
}

/**
 * Get current circuit state for monitoring
 * 
 * @param provider - The service provider
 * @returns Current circuit state and metrics
 */
export function getCircuitState(provider: string = 'nvidia'): {
    state: CircuitState;
    failures: number;
    successes: number;
    isOpen: boolean;
    timeUntilHalfOpen: number | null;
} {
    const circuit = getCircuit(provider);
    const config = getConfig(provider);
    const now = Date.now();

    let timeUntilHalfOpen: number | null = null;
    if (circuit.state === CircuitState.OPEN) {
        const elapsed = now - circuit.lastFailureTime;
        timeUntilHalfOpen = Math.max(0, config.resetTimeoutMs - elapsed);
    }

    return {
        state: circuit.state,
        failures: circuit.failures,
        successes: circuit.successes,
        isOpen: circuit.state === CircuitState.OPEN,
        timeUntilHalfOpen,
    };
}

/**
 * Force reset a circuit (for admin/testing)
 * 
 * @param provider - The service provider
 */
export function resetCircuit(provider: string = 'nvidia'): void {
    const circuit = getCircuit(provider);
    console.log(`[CircuitBreaker] ${provider}: Force reset to CLOSED`);
    circuit.state = CircuitState.CLOSED;
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.halfOpenRequests = 0;
    circuit.lastFailureTime = 0;
}

/**
 * Get all circuit states for dashboard
 */
export function getAllCircuitStates(): Map<string, ReturnType<typeof getCircuitState>> {
    const states = new Map<string, ReturnType<typeof getCircuitState>>();
    for (const [provider] of circuits) {
        states.set(provider, getCircuitState(provider));
    }
    return states;
}

/**
 * Wrapper function to execute an operation with circuit breaker protection
 * 
 * @param provider - The service provider
 * @param operation - The async operation to execute
 * @param fallback - Fallback value if circuit is open
 * @returns Result of operation or fallback
 */
export async function withCircuitBreaker<T>(
    provider: string,
    operation: () => Promise<T>,
    fallback: T
): Promise<{ result: T; usedFallback: boolean }> {
    // Check if we can proceed
    if (!canProceed(provider)) {
        return { result: fallback, usedFallback: true };
    }

    try {
        const result = await operation();
        recordSuccess(provider);
        return { result, usedFallback: false };
    } catch (error) {
        recordFailure(provider);
        throw error; // Re-throw for retry logic to handle
    }
}
