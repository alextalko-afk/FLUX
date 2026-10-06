import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { AntivirusService } from './antivirus.service';
import { FfmpegService } from './ffmpeg.service';
import { MediaService } from './media.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, AntivirusService, FfmpegService],
  exports: [MediaService],
})
export class MediaModule {}
