import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddContactDto, UpdateContactDto } from './dto/contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return this.contactsService.list(userId);
  }

  @Post()
  async add(
    @CurrentUser('id') userId: string,
    @Body() dto: AddContactDto,
  ) {
    return this.contactsService.add(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(userId, contactId, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) contactId: string,
  ) {
    return this.contactsService.remove(userId, contactId);
  }
}
