import { Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import React, { useState } from 'react';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import { Room, User } from '../utils/types';
import LockIcon from '@mui/icons-material/Lock';
import axios from 'axios';
import { socket } from '../socket';

export interface IButtonJoinChannelProps {
	switchRooms: (room: Room) => void;
	user: User | undefined;
	room: Room | undefined;
}

export function ButtonJoinChannel (props: IButtonJoinChannelProps) {
	const { switchRooms, user, room } = props;
	const [searchQuery, setSearchQuery] = useState('');
	const [dialogOpen, setDialogOpen] = useState(false);
	const [complete, setComplete] = useState<Room[]>([]);
	const [loading, setLoading] = useState(false);
	const [roomType, setRoomType] = useState('public');
	const [isOpen, setIsOpen] = useState(false);
	const [password, setPassword] = useState('');
	const [incorrect, setIncorrect] = useState(false);

	async function fetchChatUserStatus(): Promise<string | undefined> {
		if (user && room)
		{
			const response = await axios.get<string>(`http://${process.env.REACT_APP_IP}:3001/api/chat/rooms/${room.name}/${user.username}/get_chat_user_status`, { withCredentials: true });
			if (response)
				return (response.data)
		}
		else
			return ;
	}

	const handleChange = (event: React.SyntheticEvent, value: string) => {
		setSearchQuery(value);
		if (value) {
			setLoading(true);
			axios.get(`http://${process.env.REACT_APP_IP}:3001/api/chat/rooms/complete?q=${value}`, { withCredentials: true })
				.then(res => {
					setLoading(false);
					setComplete(res.data);
				})
				.catch(err => {
					setLoading(false);
					if (err) throw err;
				});
		} else {
			setComplete([]);
		}
	}

	const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setPassword(event.currentTarget.value);
	}

	const handleClick = async () => {
		if (searchQuery !== '') {
			axios.get<'public' | 'protected' | 'private'>(`http://${process.env.REACT_APP_IP}:3001/api/chat/rooms/${searchQuery}/type`, { withCredentials: true })
				.then(res => {
					setRoomType(res.data);
					if (res.data === 'protected' && password !== '') {
						axios.post(`http://${process.env.REACT_APP_IP}:3001/api/chat/check_password`, { name: searchQuery, password }, { withCredentials: true })
							.then(() => {
								setIncorrect(false);
								setPassword('');
								socket.emit('room_join', searchQuery);
								switchRooms({ name: searchQuery, type: res.data});
								setDialogOpen(false);
							})
							.catch(err => {
								setIncorrect(true);
								setPassword("");
							})
					} else if (res.data === 'public') {
						fetchChatUserStatus().then((res: string | undefined) => {
							if (res) {
								if (res === 'banned')
									setIncorrect(true);
									return ;
							}
						});
						socket.emit('room_join', searchQuery);
						switchRooms({ name: searchQuery, type: res.data});
						setDialogOpen(false);
					}
				})
				.catch(err => {
					if (err) throw err;
				});
		}
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' && !isOpen) {
			handleClick();
		}
	}

	const handleClickOpen = () => {
		setDialogOpen(true);
	}

	const handleClose = () => {
		handleClick();
	}

	const handleCancel = () => {
		setDialogOpen(false);
		setPassword('');
		setIncorrect(false);
		setRoomType('public');
	}

	return (
		<div>
			<Button variant="outlined" onClick={handleClickOpen} startIcon={<ArrowRightIcon />} fullWidth>Join Channel</Button>
			<Dialog open={dialogOpen} onClose={handleCancel}>
				<DialogTitle>Join Room</DialogTitle>
				<DialogContent>
					<Autocomplete
						loading={loading}
						onInputChange={handleChange}
						fullWidth
						options={complete}
						onOpen={() => { setIsOpen(true) }}
						onClose={() => { setIsOpen(false) }}
						// filterOptions={filterOptions}
						getOptionLabel={({ name }) => {
							return name;
						}}
						isOptionEqualToValue={(option: Room, value: Room) => {
							return option.name === value.name;
						}}
						filterSelectedOptions
						renderOption={(props, option: Room) => (
							<Box component="li" sx={{ mr: 2, flexShrink: 0, gap: 1 }} {...props}>
								{option.type === 'protected' && <LockIcon />}
								{option.name}
							</Box>
						)}
						renderInput={(params) => (
							<TextField
								{...params} 
								label="Search rooms" 
								variant="filled"
								size="medium"
								sx={{ minWidth: 200 }}
								onKeyDown={handleKeyDown}
								autoFocus
								InputProps={{
									...params.InputProps,
									endAdornment: (
										<>
											{loading ? <CircularProgress color="inherit" size={20} /> : null}
											{/* {params.InputProps.endAdornment} */}
										</>
									)
								}}
							/>
						)}
					/>
					{roomType === 'protected' && (
						<TextField
							value={password}
							type="password"
							onChange={handlePasswordChange}
							onKeyDown={handleKeyDown}
							error={incorrect}
							helperText={incorrect ? 'Incorrect password' : ''}
							label="Password..."
							margin="normal"
							fullWidth
							sx={{ mb: 2 }}
						/>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={handleCancel}>Cancel</Button>
					<Button onClick={handleClose}>Join</Button>
				</DialogActions>
			</Dialog>
		</div>
	);
}
