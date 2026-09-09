import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import {
  CardController,
  OfficerSignatureController,
} from './card.controller.js';
import { CardService } from './card.service.js';
import { OfficerSignatureService } from './officer-signature.service.js';

/**
 * PRD §19 module — membership cards.
 *
 * Imports `MediaModule` for the photographs and signatures composited at print,
 * and `AuthModule` for the record-scoped permission checks every method makes of
 * its own accord.
 *
 * Note what it does **not** import: nothing that reaches registration data.
 * Decision 10.1 keeps next-of-kin, guarantor, and contact detail away from
 * card-display data, and this module's inability to reach them is structural.
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [CardController, OfficerSignatureController],
  providers: [CardService, OfficerSignatureService],
  exports: [CardService],
})
export class CardModule {}
