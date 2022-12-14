import AddIcon from '@mui/icons-material/Add';
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	TextField,
} from '@mui/material';
import axios from 'axios';
import * as React from 'react';
import { socket } from '../socket';
import { Room, User } from '../utils/types';

export interface SimpleDialogProps {
	currentUser: User | undefined;
	open: boolean;
	setOpen: (value: boolean) => void;
	switchRooms: (room: Room) => void;
}

function SimpleDialog(props: SimpleDialogProps) {
	const { setOpen, open, switchRooms } = props;

	const [name, setName] = React.useState<string>('');
	const [taken, setTaken] = React.useState<boolean>(false);

	const handleChangeName = (event: React.ChangeEvent<HTMLInputElement>) => {
		setTaken(false);
		setName(event.target.value);
	};

	const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			handleClose();
		}
	};

	const handleClose = async () => {
		await axios
			.post(`http://${process.env.REACT_APP_IP}:3001/api/chat/create_channel`, {
				name: name.toLowerCase(),
				type: 'public',
				hash: '',
			}, { withCredentials: true })
			.then((res) => {
				if (res.data)
					setTaken(true);
				else {
					setOpen(false);
					socket.emit('room_created', { name, type: 'public' });
					switchRooms({ name, type: 'public' });
				}
			})
			.catch((err) => {
				if (err) throw err;
			});
		setName('');
	};

	const handleCancel = () => {
		setOpen(false);
		setName('');
	};

	return (
		<Dialog onClose={handleCancel} open={open}>
			<DialogTitle>Create Channel</DialogTitle>
			<DialogContent>
				<DialogContentText>
					Create a new channel
				</DialogContentText>
				<TextField
					value={name} 
					onChange={handleChangeName}
					onKeyDown={handleEnter}
					label="Channel name" 
					autoFocus margin="normal" 
					variant="standard" 
					error={taken}
					helperText={taken ? "Channel already exists" : ""}
					fullWidth sx={{mb:2}}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleCancel}>Cancel</Button>
				<Button onClick={handleClose}>Create</Button>
			</DialogActions>
		</Dialog>
	);
}

export interface IButtonCreateChannelsProps {
	switchRooms: (room: Room) => void;
	currentUser: User | undefined;
}

export const ButtonCreateChannels = (props: IButtonCreateChannelsProps) => {
	const { switchRooms, currentUser } = props;
	const [open, setOpen] = React.useState(false);

	const handleClickOpen = () => {
		setOpen(true);
	};

	return (
		<div>
			<Button
				sx={{ marginTop: '2px' }}
				variant="outlined"
				startIcon={<AddIcon />}
				onClick={handleClickOpen}
				fullWidth
			>
				Create channel
			</Button>
			<SimpleDialog
				currentUser={currentUser}
				open={open}
				setOpen={setOpen}
				switchRooms={switchRooms}
			/>
		</div>
	);
};
