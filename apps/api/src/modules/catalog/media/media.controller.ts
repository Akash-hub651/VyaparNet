import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseEnumPipe,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { MediaClass, UserRole } from '@vyaparnet/database';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';

@Controller('v1/media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @Roles(UserRole.SELLER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('productId') productId: string,
    @CurrentUser() user: any,
    @Body('mediaClass', new ParseEnumPipe(MediaClass, { optional: true }))
    mediaClass?: MediaClass,
  ) {
    return this.mediaService.upload(file, user.id, productId, mediaClass);
  }
}
