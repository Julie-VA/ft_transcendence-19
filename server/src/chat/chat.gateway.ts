import { Inject } from '@nestjs/common';
import { WebSocketGateway, SubscribeMessage, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { UserService } from '../user/user.service';
import { RoomInfo } from '../utils/types';
import { CreateChatDto, User, SetUserStatusDto, LeaveChannelDto } from '../typeorm/';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
		cors: {
			origin: `http://${process.env.REACT_APP_IP}:3000`,
			methods: ["GET", "POST"],
		},
	})
export class ChatGateway
{
	constructor(
		@Inject(ChatService) private readonly chatService: ChatService,
		@Inject(UserService) private readonly userService: UserService,
	) {}

	@WebSocketServer()
	server: Server;

	@SubscribeMessage('room_active')
	async roomActive(client: Socket, room_name: string) {
		client.join(room_name);
		const sockets = Array.from(this.server.sockets.adapter.rooms.get(room_name));
		const users = await Promise.all(sockets.map(async (socketId) => {
			return await this.userService.findUserBySocketId(socketId);
		}));
		const currentUser = await this.userService.findUserBySocketId(client.id);
		client.broadcast.to(room_name).emit('room_user_active', currentUser);
		client.emit('room_users', users);
	}

	@SubscribeMessage('room_inactive')
	async roomInactive(client: Socket, room_name: string) {
		client.leave(room_name);
		const currentUser = await this.userService.findUserBySocketId(client.id);
		if (!currentUser)
			return ;
		client.broadcast.to(room_name).emit('room_user_inactive', currentUser);
	}

	@SubscribeMessage('room_switch')
	async roomSwitch(client: Socket, roomInfo: RoomInfo) {
		const { prevRoom, room } = roomInfo;
		if (prevRoom) this.roomInactive(client, prevRoom);
		if (room) this.roomActive(client, room);
	}

	@SubscribeMessage('set_status')
	async setStatus(client: Socket, chat_user: SetUserStatusDto) {
		if (chat_user.user_id && chat_user.room_name) {
			const user = await this.chatService.getUserById(chat_user.user_id);
			const currentRoom = await this.chatService.getRoomByName(chat_user.room_name);
			if (user && currentRoom) {
				if (await this.chatService.updateStatus(user, currentRoom, chat_user.status, chat_user.time))
				{
					if (chat_user.status === 'banned')
					{
						const bannedSocket = this.server.sockets.sockets.get(user.socketId);
						const rooms = await this.chatService.getActiveRooms(user.id);
						const it = bannedSocket.rooms.values();
						it.next();
						const bannedUserCurrentRoom = it.next().value;
						let idx: number;
						if (bannedSocket.rooms.has(chat_user.room_name)) {
							idx = rooms.findIndex(room => room.name === 'general');
						} else {
							idx = rooms.findIndex(room => room.name === bannedUserCurrentRoom);
						}
						this.server.to(user.socketId).emit(`autoswitch_room`, idx);
					}
					this.server.to(user.socketId).emit(`${chat_user.status}_added`, { name: chat_user.room_name, time: chat_user.time ? chat_user.time : null});
				}

			}
		}
	}
	
	@SubscribeMessage('room_created')
	async roomCreated(client: Socket, room: { name: string, type: 'public' | 'private' | 'protected'}) {
		client.emit('new_room', { name: room.name, type: room.type });
		this.userService.findUserBySocketId(client.id).then((currentUser) => {
			if (!currentUser)
				return ;
			this.chatService.getActiveRooms(currentUser.id).then((rooms) => {	
				let index = 0;
				for (let i = 0; i < rooms.length; i++) {
					if (rooms[i].name === room.name) {
						index = i;
						break;
					}
				}
				client.emit('autoswitch_room', index);
			})
		})
	}

	@SubscribeMessage('leave_channel')
	async leaveChannel(client: Socket, data: LeaveChannelDto) {
		const room = await this.chatService.getRoomByName(data.room);
		if (!room || room.name === 'general') return;
		const { status } = await this.chatService.getChatUserStatus(data.user, room);
		if (!status) return;

		if (status === 'owner')
		{
			await this.chatService.deleteRoom(room);
			this.server.to(room.name).emit('autoswitch_room', 0);
			this.server.emit("delete_room", room);
		}
		else
		{
			await this.chatService.removeUserFromRoom(data.user, room);
			client.emit('autoswitch_room', 0);
			client.emit("delete_room", room);
		}
	}

	@SubscribeMessage('room_join')
	async roomJoin(client: Socket, room_name: string) {
		this.userService.findUserBySocketId(client.id).then((currentUser) => {
			if (currentUser) {
				this.chatService.getRoomByName(room_name).then((room_entry) => {
					this.chatService.createChatUserIfNotExists({ room_id: room_entry.id, user_id: currentUser.id, status: 'user'}).then((res) => {
						if (res.identifiers[0] !== undefined) {
							this.roomCreated(client, room_entry);
						}
					})
				})
			}
		})
	}
	
	@SubscribeMessage('message_send')
	async messageSend(client: Socket, message: CreateChatDto) {
		const currentRoom = await this.chatService.getRoomByName(message.room.name);
		const response = await this.chatService.getChatUserStatus(message.user, currentRoom);
		if (! response)
			return;
		
		if (response.status !== "muted" && response.status !== "banned")
		{
			this.chatService.createMessage(message);
			const { room } = message;
			client.broadcast.to(room.name).emit('new_message', message);
		}
	}

	@SubscribeMessage('invited')
	async invitation(client: Socket, message: number[]) {
		const invitingUser: User = await this.userService.findUserById(message[0]);
		const invitedUser: User = await this.userService.findUserById(message[1]);
		this.server.to(invitedUser.socketId).emit("invitation_alert", invitingUser);
	}

	@SubscribeMessage('invitation_accepted')
	async invitationAccepted(client: Socket, message: number[]) {
		const invitingUser: User = await this.userService.findUserById(message[0]);
		const invitedUser: User = await this.userService.findUserById(message[1]);
		const unique_id = uuidv4();
		this.server.to(invitedUser.socketId).emit("make_game_room", unique_id);
		this.server.to(invitingUser.socketId).emit("make_game_room", unique_id);
	}

	@SubscribeMessage('invitation_declined')
	async invitationDeclined(client: Socket, message: number) {
		const invitingUser: User = await this.userService.findUserById(message);
		this.server.to(invitingUser.socketId).emit("invitation_declined");
	}
}
