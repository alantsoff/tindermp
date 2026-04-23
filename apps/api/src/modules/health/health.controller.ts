import { Controller, Get } from '@nestjs/common';

@Controller('match-api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string; timestamp: string; service: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'match-api',
    };
  }
}
