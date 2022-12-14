import { Grid } from '@mui/material';
import * as React from 'react';
import Canvas from './canvas';
import { socket } from '../socket';
import { User } from "../utils/types"

export interface IProfileProps {
	user: User | undefined;
}

export function PlayGame (props: IProfileProps) {

    const { user } = props;
    React.useEffect(() => {
        return () => {
            socket.emit("remove_from_queue", user);
            socket.emit("remove_from_game");
        }
    }, [user]);

  return (
    <Grid container justifyContent='center'>
        <Canvas user={user}/>
    </Grid>
  );
}
