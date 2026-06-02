import React, { useEffect, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import Nav from '../../components/nav';
import RoomDialog from '../../components/dialog/room';
import './room.scss';
import { roomStore } from '../../stores/room';
import { globalStore } from '../../stores/global';
import { t } from '../../i18n';
import {
  clearWorkspacePresence,
  endWorkspace,
  fetchAgoraRtmToken,
  getCurrentUser,
  getHexscrumProfile,
  heartbeatWorkspacePresence,
  releaseWorkspaceLeadLock,
} from '../../utils/hexscrum-api';

export const roomTypes = [
  {value: 0, text: 'Live Workspace', path: 'one-to-one'},
  {value: 1, text: 'Small Class', path: 'small-class'},
  {value: 2, text: 'Large Class', path: 'big-class'},
];

export function RoomPage({ children }: any) {

  const history = useHistory();

  const lock = useRef<boolean>(false);
  const presenceTimer = useRef<number | null>(null);

  const sendPresenceHeartbeat = () => {
    const user = getCurrentUser();
    const profile = getHexscrumProfile();
    const room = roomStore.state;
    const workspaceId = room.course.rid;
    if (!user || !workspaceId || !room.me.uid) return;
    heartbeatWorkspacePresence(workspaceId, {
      role: room.me.role === 'teacher' ? 'lead' : 'reviewer',
      color: profile.color || user.color,
    }).catch(() => {});
  };

  useEffect(() => {

    const me = roomStore.state.me;
    const {
      rid,
      roomType,
      roomName,
      lockBoard,
      linkId,
    } = roomStore.state.course;

     const {rtmToken } = roomStore.state;

    if (!rid || !me.uid) {
      history.push('/');
    }

    const uid = me.uid;

    const payload = {
      rid,
      roomName,
      roomType,
      lockBoard,
      rtmToken,
      linkId: linkId,
      uid,
      authUserId: me.authUserId,
      role: me.role,
      account: me.account,
      boardId: me.boardId,
      grantBoard: me.grantBoard,
    }
    lock.current = true;
    if (roomStore.state.rtm.joined) return;
    globalStore.showLoading();
    fetchAgoraRtmToken(uid)
      .then((token: string) => roomStore.loginAndJoin({
        ...payload,
        rtmToken: token || rtmToken,
      }, true))
      .then(() => {
        sendPresenceHeartbeat();
        if (presenceTimer.current) {
          window.clearInterval(presenceTimer.current);
        }
        presenceTimer.current = window.setInterval(sendPresenceHeartbeat, 10000);

      }).catch((err: any) => {
      globalStore.showToast({
        type: 'rtmClient',
        message: err.reason || t('toast.login_failure'),
      });
      history.push('/');
    })
    .finally(() => {
      globalStore.stopLoading();
      lock.current = false;
    });
  }, []);

  const roomType = roomTypes[roomStore.state.course.roomType];

  const location = useLocation();

  useEffect(() => {
    return () => {
      if (presenceTimer.current) {
        window.clearInterval(presenceTimer.current);
        presenceTimer.current = null;
      }
      const room = roomStore.state;
      const isLeadLeavingWorkspace =
        room.me.role === 'teacher' &&
        Boolean(room.course.rid) &&
        Boolean(location.pathname.match(/one-to-one/));
      if (isLeadLeavingWorkspace) {
        const workspaceId = room.course.rid;
        clearWorkspacePresence(workspaceId).catch(() => {});
        endWorkspace(workspaceId).catch(() => {});
        releaseWorkspaceLeadLock(workspaceId).catch(() => {});
        roomStore.rtmClient.sendChannelMessage(JSON.stringify({
          type: 'workspace-ended',
          workspaceId,
          endedBy: room.me.uid,
        })).catch(() => {});
      } else if (room.course.rid) {
        clearWorkspacePresence(room.course.rid).catch(() => {});
      }
      globalStore.removeUploadNotice();
      roomStore.exitAll()
      .then(() => {
      })
      .catch(console.warn)
      .finally(() => {
      });
    }
  }, [location]);

  return (
    <div className={`classroom ${roomType.path}`}>
      <Nav />
      {children}
      <RoomDialog />
    </div>
  );
}
