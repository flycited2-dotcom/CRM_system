import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IntakeService } from './intake.service';
import { IntegrationKeyGuard, type RequestWithIntegration } from './integration-key.guard';

/**
 * The single entry point for external systems (sites, parsers, bots).
 * Authenticated by the integration key instead of a user session.
 *
 * Bodies are typed as plain objects on purpose: the global validation pipe
 * rejects unknown fields, while external systems are free to send extra ones.
 * Each payload is normalised field by field in the service.
 */
@UseGuards(IntegrationKeyGuard)
@Controller()
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Post('intake/leads')
  @HttpCode(200)
  createLead(@Body() body: Record<string, unknown>, @Req() request: RequestWithIntegration) {
    return this.intakeService.createLead(request.integration!, body);
  }

  // Path and header name from the original site webhook specification.
  @Post('webhooks/site-leads')
  @HttpCode(200)
  createSiteLead(@Body() body: Record<string, unknown>, @Req() request: RequestWithIntegration) {
    return this.intakeService.createLead(request.integration!, body);
  }

  @Post('intake/tenders')
  @HttpCode(200)
  importTenders(@Body() body: Record<string, unknown>, @Req() request: RequestWithIntegration) {
    return this.intakeService.importTenders(request.integration!, body);
  }
}
