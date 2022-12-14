import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Blocklist, Chat, ChatUser, CreateChatDto, CreateChatUserDto, CreateRoomDto, Room, User } from '../typeorm/';
import { Repository, UpdateResult } from 'typeorm';
import { PasswordDto } from 'src/utils/password.dto';
import { v4 as uuidv4 } from 'uuid';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {

	constructor(
		@InjectRepository(Chat) private readonly chatRepo: Repository<Chat>,
		@InjectRepository(Room) private readonly roomRepo: Repository<Room>,
		@InjectRepository(User) private readonly userRepo: Repository<User>,
		@InjectRepository(Blocklist) private readonly blockRepo: Repository<Blocklist>,
		@InjectRepository(ChatUser) private readonly chatUserRepo: Repository<ChatUser>,
		private schedulerRegistry: SchedulerRegistry,
	) {
		this.roomRepo.upsert({ name: 'general', type: 'public' }, ["name"]);
	}

	//get all the table
	getChat() : Promise<Chat[]> {
		return this.chatRepo.find();
	}

	//Return every message of a room
	public async getRoomMessages(room_id: number, user: User) : Promise<Chat[]> {
		const blocklist = await this.userRepo.createQueryBuilder('users')
			.leftJoinAndSelect('users.blocking', 'blocker')
			.where('blocker.blocker = :id', { id: user.id })
			.getMany()

		if (Object.keys(blocklist).length !== 0)
			return this.getRoomMessagesBlocks(room_id, blocklist);
		else
			return this.getRoomMessagesNoBlocks(room_id);
	}

	//Return every message from a room exept those send by blocked users
	public async getRoomMessagesBlocks(room_id: number, blocklist: User[])
	{
		return await this.chatRepo.createQueryBuilder('chat')
			.leftJoinAndSelect('chat.user', 'user')
			.where('chat.room_id = :id', { id: room_id })
			.andWhere("chat.user_id NOT IN (:...ids)", {ids: blocklist.map(user => { return ( user.id )})})
			.orderBy('chat.createdat', 'ASC')
			.getMany();
	}

	//Same as getRoomMessages ?
	public async getRoomMessagesNoBlocks(room_id: number)
	{
		return await this.chatRepo.createQueryBuilder('chat')
			.leftJoinAndSelect('chat.user', 'user')
			.where('chat.room_id = :id', { id: room_id })
			.orderBy('chat.createdat', 'ASC')
			.getMany();
	}

	//Return a single message from his id
	getMessage(id: number): Promise<Chat> {
		return this.chatRepo.findOneBy({ message_id : id, });
	}

	//Add a message to the database from the DTO
	async createMessage(body: CreateChatDto) : Promise<Chat> {
		body.room = await this.getRoomByName(body.room.name);
		return this.chatRepo.save(body);
	}

	//Return the last message of a given room
	getLastMessage(room: Room): Promise<Chat> {

		return this.chatRepo.findOne({
			where: [{room : room}],
			order : {createdAt: 'DESC'}
			});
	}

	//Return a user with a given name
	getUserByName(name: string): Promise<User> {
		return this.userRepo.findOneBy({ username: name });
	}

	//Return a user
	getUserById(num: number): Promise<User> {
		return this.userRepo.findOneBy({ id: num });
	}

	//Return a room with a given name
	getRoomByName(name: string): Promise<Room> {
		return this.roomRepo.findOneBy({ name: name });
	}

	//Return a room
	getRoomById(id: number): Promise<Room> {
		return this.roomRepo.findOneBy({ id: id });
	}

	async getActiveRooms(userId: number) {
		const ret = await this.roomRepo.createQueryBuilder('room')
			.leftJoinAndSelect('room.chat_user', 'chat_user')
			.where('chat_user.user_id = :id', { id: userId })
			.andWhere('chat_user.status != :banned', { banned: "banned" })
			.orderBy('chat_user.join_date', 'ASC')
			.getMany();
		const ret_with_user = await Promise.all(ret.map( async (room) => {
			const user = await this.userRepo.createQueryBuilder('user')
				.leftJoin('user.chat_user', 'chat_user')
				.leftJoin('chat_user.room', 'room')
				.where('room.type = :type', { type: 'private'})
				.andWhere('chat_user.room_id = :room_id', { room_id: room.id })
				.andWhere('chat_user.user_id != :user_id', { user_id: userId})
				.getOne();
			return { name : room.name, type : room.type, DM_user : user?.username}
		}));
		return ret_with_user;
	}

	async getRoomOrCreate(name: string): Promise<Room> {
		await this.roomRepo.createQueryBuilder()
		.insert()
		.orIgnore()
		.into(Room)
		.values({name, type: 'public'})
		.execute();
		return this.roomRepo.findOneBy({ name: name });
	}

	createRoom(room: CreateRoomDto): Promise<Room> {
		return this.roomRepo.save(room);
	}

	async getChatUserStatus(chatUser: User, currentRoom: Room) {
		if (!chatUser || !currentRoom) return;
		const chatU = await this.chatUserRepo.findOne({
			where: {
				room: { id: currentRoom.id },
				user: { id: chatUser.id}
			},
		});
		if (!chatU) {
			return;
		}
		return { status: chatU.status, time: chatU.expirationDate};
	}

	async updateStatus(user: User, currentRoom: Room, newStatus: "user" | "owner" | "admin" | "muted" | "banned", time: '60000' | '300000' | '3600000'): Promise<boolean> {
		const chatUser = await this.chatUserRepo.findOne({
			where: {
				room: { id: currentRoom.id },
				user: { id: user.id}
			},
		});
		if (!chatUser)
			return false;
		if (newStatus !== 'muted' && newStatus !== 'banned') {
			const updatedStatus = await this.chatUserRepo.update(chatUser.id, {status: newStatus});
			if (updatedStatus)
				return true;
		}
		else {
			const currentTime = new Date;
			const updatedStatus = await this.chatUserRepo.update(chatUser.id, {status: newStatus, expirationDate: new Date(currentTime.getTime() + parseInt(time))});
			if (updatedStatus && (newStatus === 'muted' || newStatus === 'banned')) {
				const callback = () => {
					if (newStatus === 'muted')
						this.chatUserRepo.update(chatUser.id, { status: 'user', expirationDate: null });
					else {
						this.chatUserRepo.delete(chatUser.id);
					}
					this.schedulerRegistry.deleteTimeout(`${user.username}-${newStatus}-${currentRoom.name}`);
				}
				
				const timeout = setTimeout(callback, parseInt(time));
				this.schedulerRegistry.addTimeout(`${user.username}-${newStatus}-${currentRoom.name}`, timeout);
				return true;
			}
		}
		return false;
	}

	async createChatUserIfNotExists(chatUser: CreateChatUserDto) {
		const entry = this.chatUserRepo.create({
			room: await this.roomRepo.findOneBy({ id: chatUser.room_id }),
			user: await this.userRepo.findOneBy({ id: chatUser.user_id}),
			status: chatUser.status,
		});
		return this.chatUserRepo.createQueryBuilder()
			.insert()
			.orIgnore()
			.into(ChatUser)
			.values(entry)
			.execute();
	}

	async checkIfDmRoomExists(user1 : User, user2 : User) { 
		const room = await this.roomRepo.createQueryBuilder('room')
			.leftJoin('room.chat_user', 'chat_user')
			.where('chat_user.user_id = :id', {id: user1.id})
			.andWhere((qb) => {
				const subQuery = qb
					.subQuery()
					.select('chat_user.room_id')
					.from(ChatUser, 'chat_user')
					.where('chat_user.user_id = :user2id')
					.getQuery();
				return ("room.id IN " + subQuery);
			})
			.setParameter('user2id', user2.id)
			.andWhere("room.type = :type", { type: "private" })
			.getOne();
		if (!room) {
			const createdRoom = await this.createRoom({ name: uuidv4(), type: 'private', hash: '' });
			await this.createChatUserIfNotExists({ user_id: user1.id, room_id: createdRoom.id, status: 'user' });
			await this.createChatUserIfNotExists({ user_id: user2.id, room_id: createdRoom.id, status: 'user' });
			return { created: true, room : {name: createdRoom.name, type: createdRoom.type, DM_user: user1.username}};
		} else {
			return { created: false, room : {name: room.name, type: room.type, DM_user: user1.username}};
		}
	}

	async updateRoom(data: PasswordDto) {
		const room = await this.roomRepo.findOneBy({ name: data.name });
		if (!data.password)
			return this.roomRepo.update(room.id, { hash: undefined, type: 'public' });
		return this.roomRepo.update(room.id, { hash: data.password, type: 'protected' });
	}

	async complete(query: string, user: User) { 
		const alreadyJoined = (await this.roomRepo.createQueryBuilder('room')
			.leftJoin('room.chat_user', 'chat_user')
			.where('chat_user.user_id = :id', { id: user.id })
			.getMany())
			.map((room) => { return (room.id) });

		const result = await this.roomRepo.createQueryBuilder('room')
			.where('room.id NOT IN (:...ids)', { ids: alreadyJoined })
			.andWhere('room.type != :type', { type : "private"})
			.andWhere('room.name LIKE :query', { query: `%${query}%` })
			.getMany();

		return result.map(({ name, type }) => {
			return ({ name, type })
		});
	}

	async removeUserFromRoom(user : User, room : Room) {
		await this.chatUserRepo.createQueryBuilder('chat_user')
			.delete()
			.from(ChatUser)
			.where('room_id = :room_id', { room_id: room.id })
			.andWhere('user_id = :user_id', { user_id: user.id})
			.execute()
	}

	async deleteRoom(room : Room) {
		await this.chatUserRepo.createQueryBuilder('chat_user')
		.delete()
		.from(ChatUser)
		.where('room_id = :room_id', { room_id: room.id })
		.execute()

		await this.chatRepo.createQueryBuilder('chat')
		.delete()
		.from(Chat)
		.where('room_id = :room_id', { room_id: room.id })
		.execute()

		await this.roomRepo.createQueryBuilder('room')
			.delete()
			.from(Room)
			.where('id = :id', { id: room.id })
			.execute()
	}
}
