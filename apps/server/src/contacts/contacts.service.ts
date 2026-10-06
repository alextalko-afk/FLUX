import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from '../privacy/privacy.service';
import { AddContactDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  private toPublicUser(user: any, viewerId?: string) {
    const visibility = this.privacy.visibilityFor(user, viewerId);
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: visibility.bio ? user.bio : null,
      avatarUrl: visibility.avatarUrl ? user.avatarUrl : null,
      presence: visibility.online ? user.presence : 'OFFLINE',
      lastSeenAt: visibility.lastSeen ? user.lastSeenAt : null,
      isVerified: user.isVerified,
    };
  }

  async list(userId: string): Promise<{ items: any[] }> {
    const contacts = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      include: { target: { include: { privacySettings: true } } },
      orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: contacts.map((contact) => ({
        id: contact.id,
        nickname: contact.nickname,
        isFavorite: contact.isFavorite,
        createdAt: contact.createdAt,
        user: this.toPublicUser(contact.target, userId),
      })),
    };
  }

  async add(userId: string, dto: AddContactDto): Promise<any> {
    if (!dto.targetId && !dto.targetUsername && !dto.phone) {
      throw new BadRequestException({
        message: 'Provide targetId, or targetUsername.',
        code: 'CONTACT_TARGET_REQUIRED',
      });
    }

    let target: any = null;

    if (dto.targetId) {
      target = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
      });
    } else if (dto.targetUsername) {
      target = await this.prisma.user.findUnique({
        where: { username: dto.targetUsername },
      });
    }

    if (!target || target.isBlocked) {
      throw new NotFoundException({
        message: 'User not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (target.id === userId) {
      throw new BadRequestException({
        message: 'You cannot add yourself to contacts.',
        code: 'CANNOT_ADD_SELF',
      });
    }

    const blockedByOwner = await this.prisma.blockedUser.findUnique({
      where: {
        ownerId_targetId: {
          ownerId: userId,
          targetId: target.id,
        },
      },
    });

    const blockedByTarget = await this.prisma.blockedUser.findUnique({
      where: {
        ownerId_targetId: {
          ownerId: target.id,
          targetId: userId,
        },
      },
    });

    if (blockedByOwner || blockedByTarget) {
      throw new ForbiddenException({
        message: 'Contact cannot be added due to privacy restrictions.',
        code: 'CONTACT_BLOCKED',
      });
    }

    const existingContact = await this.prisma.contact.findFirst({
      where: {
        ownerId: userId,
        targetId: target.id,
      },
    });

    if (existingContact) {
      throw new ConflictException({
        message: 'Contact already exists.',
        code: 'CONTACT_ALREADY_EXISTS',
      });
    }

    const contact = await this.prisma.contact.create({
      data: {
        ownerId: userId,
        targetId: target.id,
        nickname: dto.nickname?.trim() || null,
        isFavorite: false,
        isBlocked: false,
      },
      include: { target: { include: { privacySettings: true } } },
    });

    return {
      id: contact.id,
      nickname: contact.nickname,
      isFavorite: contact.isFavorite,
      createdAt: contact.createdAt,
      user: this.toPublicUser(contact.target, userId),
    };
  }

  async update(userId: string, contactId: string, dto: UpdateContactDto): Promise<any> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        ownerId: userId,
      },
      include: { target: { include: { privacySettings: true } } },
    });

    if (!contact) {
      throw new NotFoundException({
        message: 'Contact not found.',
        code: 'CONTACT_NOT_FOUND',
      });
    }

    const updatedContact = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        nickname: dto.nickname !== undefined ? dto.nickname.trim() || null : undefined,
        isFavorite: dto.isFavorite !== undefined ? dto.isFavorite : undefined,
      },
      include: { target: { include: { privacySettings: true } } },
    });

    return {
      id: updatedContact.id,
      nickname: updatedContact.nickname,
      isFavorite: updatedContact.isFavorite,
      createdAt: updatedContact.createdAt,
      user: this.toPublicUser(updatedContact.target, userId),
    };
  }

  async remove(userId: string, contactId: string): Promise<{ removed: boolean }> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        ownerId: userId,
      },
    });

    if (!contact) {
      throw new NotFoundException({
        message: 'Contact not found.',
        code: 'CONTACT_NOT_FOUND',
      });
    }

    await this.prisma.contact.delete({
      where: { id: contactId },
    });

    return { removed: true };
  }
}
