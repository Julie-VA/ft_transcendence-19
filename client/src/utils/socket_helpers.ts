import axios from "axios";
import { socket } from "../socket";
import { Message, Room, User } from "./types";

// export const joinChat = (room: string) => {
// 	if (socket && room) {
// 		socket.emit('room_join', room);
// 	}
// };

export const leaveChat = (room: string) => {
	if (socket) socket.emit('room_inactive', room);
};

export const switchRoom = (prevRoom: string, room: string) => {
	if (socket) {
		socket.emit("room_switch", { prevRoom, room });
	}
};

export const subscribeToAutoSwitchRoom = (callback: (data: number) => void) => {
	if (!socket) return;

	socket.on('autoswitch_room', (data) => {
		callback(data);
	});
};

export const subscribeToMessages = (callback: (data: Message) => void) => {
	if (!socket) return;

	socket.on('new_message', (data) => {
		callback(data);
	});
};

export const subscribeToNewRoom = (callback: (data: Room) => void) => {
	if (!socket) return;
	
	socket.on('new_room', (data) => {
		callback(data);
	});
};

export const subscribeToUpdateRoom = (callback: (data: Room) => void) => {
	if (!socket) return;

	socket.on('update_room', (data) => {
		callback(data);
	});
};

export const subscribeToDeleteRoom = (callback: (data: Room) => void) => {
	if (!socket) return;

	socket.on('delete_room', (data) => {
		callback(data);
		// socket.emit('room_join', 'general');
	})
}

export const subscribeToRoomUserList = (callback: (data: User[]) => void) => {
	if (!socket) return;

	socket.on('room_users', (data) => {
		callback(data);
	});
};

export const subscribeToRoomUserJoin = (callback: (data: User) => void) => {
	if (!socket) return;

	socket.on('room_user_active', (data) => {
		callback(data);
	});
};

export const subscribeToRoomUserLeave = (callback: (data: User) => void) => {
	if (!socket) return;

	socket.on('room_user_inactive', (data) => {
		callback(data);
	});
};

export const sendMessage = (data: Message) => {
	if (!socket) return;

	socket.emit('message_send', data);
};

export const fetchRooms = async () => {
	const response = await axios.get<Room[]>(`http://${process.env.REACT_APP_IP}:3001/api/chat/get_rooms`, { withCredentials: true });

	return response.data;
};

export const fetchRoomMessages = async (room: string) => {
	const response = await axios.get<Message[]>(`http://${process.env.REACT_APP_IP}:3001/api/chat/rooms/${room}/messages`, { withCredentials: true });

	return response.data;
};