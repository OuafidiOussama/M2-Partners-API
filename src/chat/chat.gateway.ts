import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';
import * as jwt from 'jsonwebtoken';
import jwksRsa = require('jwks-rsa');

interface SendMessagePayload {
  to_user_id: string;
  message: string;
}

@WebSocketGateway({ cors: { origin: 'http://localhost:5173' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<string, string>();
  private jwksClient: jwksRsa.JwksClient;

  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {
    const tenantId = config.get<string>('AZURE_TENANT_ID');
    this.jwksClient = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    });
  }

  private getSigningKey(kid: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(kid, (err, key) => {
        if (err) return reject(err);
        resolve(key!.getPublicKey());
      });
    });
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const tenantId = this.config.get<string>('AZURE_TENANT_ID');
      const clientId = this.config.get<string>('AZURE_CLIENT_ID');
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
        client.disconnect();
        return;
      }

      const signingKey = await this.getSigningKey(decoded.header.kid);
      const payload = jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        audience: clientId,
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      }) as jwt.JwtPayload;

      const oid = payload['oid'] as string;
      const azureEmail = payload['preferred_username'] as string;

      let user = await this.usersService.findByAzureOid(oid);
      if (!user) {
        user = await this.usersService.findByEmail(azureEmail);
        if (!user) user = await this.usersService.findByAzureEmail(azureEmail);
        if (!user) {
          client.disconnect();
          return;
        }
        await this.usersService.updateAzureOid(user.id, oid);
      }

      client.data.userId = user.id;
      this.userSockets.set(user.id, client.id);

      const history = await this.chatService.getHistory(user.id, user.id);
      client.emit('chat_history', history);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      this.userSockets.delete(userId);
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUserId = client.data.userId as string;
    if (!fromUserId) return;

    const saved = await this.chatService.saveMessage(
      fromUserId,
      payload.to_user_id,
      payload.message,
    );

    const recipientSocketId = this.userSockets.get(payload.to_user_id);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('receive_message', {
        from_user_id: fromUserId,
        message: saved.message,
        created_at: saved.created_at,
      });
    }
  }
}
