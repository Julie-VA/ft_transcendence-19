import axios, { AxiosRequestConfig } from "axios/";
import { User, UserQueryResponse, Ranking} from "./types";

const CONFIG: AxiosRequestConfig = { withCredentials: true };
const QRCONFIG: AxiosRequestConfig = { withCredentials: true, responseType: 'blob' };

export const getAuthStatus = () => axios.get<User>(`http://${process.env.REACT_APP_IP}:3001/api/auth/status`, CONFIG);
export const getUser = (username: string | undefined) => axios.get<UserQueryResponse>(`http://${process.env.REACT_APP_IP}:3001/api/user/get_user/${username}`, CONFIG);
export const getQRCode = () => axios.post<Blob>(`http://${process.env.REACT_APP_IP}:3001/api/2fa/generate`, '', QRCONFIG);
export const getLeaderBoard = () => axios.get<Ranking[]>(`http://${process.env.REACT_APP_IP}:3001/api/user/leaderboard`, CONFIG);
export const getIsFriend = (friendId: string | undefined) => axios.get<boolean>(`http://${process.env.REACT_APP_IP}:3001/api/user/is_friend?id=${friendId}`, CONFIG);
export const getIsBlocked = (blockeeId: string | undefined) => axios.get<boolean>(`http://${process.env.REACT_APP_IP}:3001/api/user/is_blocked?id=${blockeeId}`, CONFIG);