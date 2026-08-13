import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('getHello devuelve el mensaje del servicio', () => {
    const service = new AppService();
    const controller = new AppController(service);

    expect(controller.getHello()).toBe('Hello World!');
    expect(service.getHello()).toBe('Hello World!');
  });
});
