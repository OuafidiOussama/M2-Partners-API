import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
  ) {}

  async saveMessage(
    fromUserId: string,
    toUserId: string,
    message: string,
  ): Promise<ChatMessage> {
    const msg = this.chatRepo.create({
      from_user: { id: fromUserId } as any,
      to_user: { id: toUserId } as any,
      message,
    });
    return this.chatRepo.save(msg);
  }

  async getHistory(
    userId1: string,
    userId2: string,
  ): Promise<ChatMessage[]> {
    return this.chatRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.from_user', 'from')
      .leftJoinAndSelect('msg.to_user', 'to')
      .where(
        '(msg.from_user_id = :u1 AND msg.to_user_id = :u2) OR (msg.from_user_id = :u2 AND msg.to_user_id = :u1)',
        { u1: userId1, u2: userId2 },
      )
      .orderBy('msg.created_at', 'DESC')
      .limit(50)
      .getMany();
  }
}
