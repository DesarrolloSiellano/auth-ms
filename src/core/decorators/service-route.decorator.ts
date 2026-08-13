import { SetMetadata } from '@nestjs/common';

export const SERVICE_ROUTE_KEY = 'service_route';

/**
 * Marca una ruta HTTP como de acceso de servicio: exige la clave
 * compartida `SERVICE_API_KEY` (header `x-service-key`).
 */
export const ServiceRoute = () => SetMetadata(SERVICE_ROUTE_KEY, true);
