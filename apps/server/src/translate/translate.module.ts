import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { TranscribeService } from './transcribe.service';

@Module({ controllers: [TranslateController], providers: [TranslateService, TranscribeService] })
export class TranslateModule {}
