import { CreateRoomDto, User } from 'src/typeorm';
import { AuthenticatedGuard } from '../auth/guards/intra-oauth.guard';
import { ChatService } from './chat.service';
import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PasswordDto } from '../utils/password.dto';
import * as bcrypt from 'bcrypt';
import { RequestWithUser } from 'src/utils/types';
import { Response } from 'express';
import { UserService } from 'src/user/user.service';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
export class ChatController {

	constructor(
		@Inject(ChatService) private readonly chatService: ChatService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
		@Inject(UserService) private readonly userService: UserService,
	) {}

	@Get('get_rooms')
	@UseGuards(AuthenticatedGuard)
	async getRooms(@Req() req: RequestWithUser) {
		const rooms = await this.chatService.getActiveRooms(req.user.id);
		return rooms;
	}

	@Get('rooms/:room_name/messages')
	@UseGuards(AuthenticatedGuard)
	async getRoomMessages(@Param('room_name') room_name: string, @Req() req: RequestWithUser) {
		const room = await this.chatService.getRoomByName(room_name);
		if (!room)
			return ;
		return this.chatService.getRoomMessages(room.id, req.user);
	}

	@Get('rooms/complete')
	@UseGuards(AuthenticatedGuard)
	complete(@Query('q') query: string, @Req() req: RequestWithUser) {
		return this.chatService.complete(query, req.user);
	}

	@Get('rooms/:room_name/type')
	@UseGuards(AuthenticatedGuard)
	async getRoomInfo(@Param('room_name') room_name: string) {
		const room = await this.chatService.getRoomByName(room_name);
		if (room)
			return room.type;
	}

	@Post('rooms/:room_name/join_room')
	@UseGuards(AuthenticatedGuard)
	joinRoom(@Param('room_name') room_name: string) {

	}

	@Post('create_channel')
	@UseGuards(AuthenticatedGuard)
	async createChannel(@Body() roomDto: CreateRoomDto, @Req() req: RequestWithUser) {
		const room = await this.chatService.getRoomByName(roomDto.name);
		if (room)
			return true;
		const created_room = await this.chatService.createRoom(roomDto);
		const insertResult =  await this.chatService.createChatUserIfNotExists({ room_id: created_room.id, user_id: req.user.id, status: 'owner' });
		if (insertResult.identifiers[0] !== undefined) {
			return false;
		} else {
			return true;
		}
	}

	@Post('set_password')
	@UseGuards(AuthenticatedGuard)
	async sendPassword(@Body() data: PasswordDto, @Req() req: RequestWithUser) {
		const hashedPassword = bcrypt.hashSync(data.password, process.env.SALT);
		this.chatService.updateRoom({ name: data.name, password: hashedPassword });
		this.chatGateway.server.emit('update_room', { name: data.name, type: 'protected' });
	}

	@Post('delete_password')
	@UseGuards(AuthenticatedGuard)
	async deletePassword(@Body() data: PasswordDto, @Req() req: RequestWithUser) {
		this.chatService.updateRoom({ name: data.name, password: undefined });
		this.chatGateway.server.emit('update_room', { name: data.name, type: 'public' });
	}

	@Post('check_password')
	@UseGuards(AuthenticatedGuard)
	async checkPassword(@Body() data: PasswordDto, @Res() res: Response, @Req() req: RequestWithUser) {
		const hashedPassword = bcrypt.hashSync(data.password, process.env.SALT);
		const { hash: roomHash } = await this.chatService.getRoomByName(data.name);
		if (roomHash === hashedPassword) {
			const client = this.chatGateway.server.sockets.sockets.get(req.user.socketId);
			if (!client)
				return res.status(401).send();
			this.chatGateway.roomJoin(client, data.name);
			return res.status(200).send();
		} else {
			return res.status(401).send();
		}
	}

	@Get('rooms/:room_name/:username/get_chat_user_status')
	@UseGuards(AuthenticatedGuard)
	async getChatUserStatus(@Param('room_name') room_name: string, @Param('username') username: string, @Req() req: RequestWithUser) {
		const currentRoom = await this.chatService.getRoomByName(room_name);
		const chatUser = await this.chatService.getUserByName(username);
		return this.chatService.getChatUserStatus(chatUser, currentRoom);
	}

	@Get('rooms/check_dm')
	@UseGuards(AuthenticatedGuard)
	async checkDM(@Query('user') userId: number, @Req() req: RequestWithUser) {
		const user = await this.userService.findUserById(userId);
		const ret = await this.chatService.checkIfDmRoomExists(req.user, user);
		if (ret.created) {
			this.chatGateway.server.to(user.socketId).emit('new_room', ret.room);
		}
		return ret.room;
	}
}
