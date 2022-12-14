import { Inject } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from 'src/chat/chat.service';
import { UserService } from './user.service';

@WebSocketGateway({
	cors: {
		origin: `http://${process.env.REACT_APP_IP}:3000`,
		methods: ["GET", "POST"],
	},
})
export class UserGateway {

	constructor(
		@Inject(UserService) private readonly userService: UserService,
		@Inject(ChatService) private readonly chatService: ChatService,
	) {}
	@WebSocketServer() wss: Server;

	@SubscribeMessage('identity')
	async handleMessage(client: Socket, user_id: number) {
		await this.userService.addSocketId(user_id, client.id);
		client.emit('socket_saved');
		this.userService.setStatus(user_id, 'online');
		const ConnectedUser = await this.userService.findUserById(user_id);
		this.wss.emit("color_change", { status: 'online', user: ConnectedUser});
		const general = await this.chatService.getRoomByName('general');
		this.chatService.createChatUserIfNotExists({ user_id, room_id: general.id, status: 'user' });
	}
}
