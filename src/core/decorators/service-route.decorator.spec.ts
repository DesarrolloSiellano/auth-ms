import 'reflect-metadata';
import { SERVICE_ROUTE_KEY, ServiceRoute } from './service-route.decorator';

describe('ServiceRoute decorator', () => {
  it('marca una clase como ruta de servicio', () => {
    @ServiceRoute()
    class TestClass {}

    const metadata = Reflect.getMetadata(SERVICE_ROUTE_KEY, TestClass);
    expect(metadata).toBe(true);
  });

  it('expone la clave de metadata correcta', () => {
    expect(SERVICE_ROUTE_KEY).toBe('service_route');
  });
});
