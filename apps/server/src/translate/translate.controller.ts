import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TranslateService } from './translate.service';
import { TranscribeService } from './transcribe.service';

class TranslateDto {
  @IsString() @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/) to!: string;
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class TranslateController {
  constructor(
    private readonly translator: TranslateService,
    private readonly transcriber: TranscribeService,
  ) {}

  @Post(':id/transcribe')
  @HttpCode(HttpStatus.OK)
  transcribe(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transcriber.transcribe(userId, id);
  }

  @Post(':id/translate')
  @HttpCode(HttpStatus.OK)
  translate(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TranslateDto) {
    return this.translator.translate(userId, id, dto.to);
  }
}
