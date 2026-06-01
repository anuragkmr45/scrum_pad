import React, { useState, useEffect, useRef } from 'react';
import { Theme, FormControl } from '@material-ui/core';
import {makeStyles} from '@material-ui/core/styles';
import Button from '../components/custom-button';
import RoleRadio from '../components/role-radio';
import FormInput from '../components/form-input';
import FormSelect from '../components/form-select';
import { Link, useHistory } from 'react-router-dom';
import { roomStore } from '../stores/room';
import { genUid } from '../utils/helper';
import MD5 from 'js-md5';
import { globalStore, roomTypes } from '../stores/global';
import { t } from '../i18n';
import {
  checkBackendHealth,
  createWorkspace,
  getHexscrumProfile,
  saveHexscrumProfile,
  setWorkspaceId,
} from '../utils/hexscrum-api';

const useStyles = makeStyles ((theme: Theme) => ({
  formControl: {
    minWidth: '240px',
    maxWidth: '240px',
  }
}));

type SessionInfo = {
  roomName: string
  roomType: number
  yourName: string
  role: string
}

const defaultState: SessionInfo = {
  roomName: '',
  roomType: 0,
  role: '',
  yourName: '',
}

const hasAgoraAppId = Boolean(process.env.REACT_APP_AGORA_APP_ID);
const hasConverterUrl = Boolean(process.env.REACT_APP_LIBRE_BACKEND_URL);
const storedProfile = getHexscrumProfile();

function HomePage() {
  document.title = t(`home.short_title.title`)
  const classes = useStyles();

  const history = useHistory();

  const ref = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      ref.current = true;
    }
  }, []);

  const [session, setSessionInfo] = useState<SessionInfo>({
    ...defaultState,
    yourName: storedProfile.name,
  });
  const [designation, setDesignation] = useState<string>(storedProfile.designation);
  const [userColor, setUserColor] = useState<string>(storedProfile.color);
  const [backendHealth, setBackendHealth] = useState<any>({
    checked: false,
    ok: true,
  });

  const [required, setRequired] = useState<any>({} as any);

  useEffect(() => {
    if (!hasConverterUrl) return;
    checkBackendHealth().then((health: any) => {
      setBackendHealth({
        checked: true,
        ok: Boolean(health.ok),
        details: health,
      });
    });
  }, []);

  const handleSubmit = () => {
    if (!hasAgoraAppId) {
      globalStore.showToast({
        type: 'rtmClient',
        message: 'Missing REACT_APP_AGORA_APP_ID. Set frontend/.env.local before joining a live workspace.',
      });
      return;
    }

    if (!session.roomName) {
      setRequired({...required, roomName: t('home.missing_room_name')});
      return;
    }

    if (!session.yourName) {
      setRequired({...required, yourName: t('home.missing_your_name')});
      return;
    }

    if (!session.role) {
      setRequired({...required, role: t('home.missing_role')});
      return;
    }
    if (!roomTypes[session.roomType]) return;
    const path = roomTypes[session.roomType].path
    const payload = {
      uid: genUid(),
      rid: `${session.roomType}${MD5(session.roomName)}`,
      role: session.role,
      roomName: session.roomName,
      roomType: session.roomType,
      video: 0,
      audio: 0,
      chat: 0,
      account: session.yourName,
      rtmToken: '',
      boardId: '',
      linkId: 0,
      sharedId: 0,
      lockBoard: 0,
      grantBoard: 0,
    }
    const profile = saveHexscrumProfile({
      userId: payload.uid,
      name: session.yourName,
      designation,
      color: userColor,
    });
    setWorkspaceId(payload.rid);
    createWorkspace({
      id: payload.rid,
      name: session.roomName,
      ownerUserId: payload.uid,
      metadata: {
        roomType: session.roomType,
        role: session.role,
        userName: profile.name,
        userDesignation: profile.designation,
        userColor: profile.color,
      },
    }).catch(() => {});
    ref.current = true;
    globalStore.showLoading();
    roomStore.loginAndJoin(payload).then(() => {
      Object.keys(localStorage).forEach((key) => {
        if (key.indexOf('/annotations') !== -1) {
          localStorage.removeItem(`${key}`);
        }
      });
      history.push(`/classroom/${path}`);
    }).catch((err: any) => {
      if (err.reason) {
        globalStore.showToast({
          type: 'rtmClient',
          message: t('toast.rtm_login_failed_reason', {reason: err.reason}),
        })
      } else {
        globalStore.showToast({
          type: 'rtmClient',
          message: t('toast.rtm_login_failed'),
        })
      }
      console.warn(err);
    })
    .finally(() => {
        ref.current = false;
        globalStore.stopLoading();
    })
  }

  return (
    <div className={`flex-container home-cover-web`}>
      <div className="web-menu">
        <div className="web-menu-container">
          <span className="site-logo">
          </span>
        <div className="short-title">
            <span className="title">{t('home.short_title.title')}</span>
            <span className="subtitle">{t('home.short_title.subtitle')}</span>
          </div>
        </div>
      </div>
      <div className="card-container">
      <div className="card-info">
        <div className="card-info-block">
        <span className="card-title">
          <h3>Document Workspace for live review, meeting notes, and annotation reports</h3>
          <p>HexScrum Workspace is a fast MVP base for collaborative document review. It keeps the proven open-source whiteboard path while presenting enterprise review language for local demos.</p>
        </span>
        <div className="setup-warnings">
          {!hasAgoraAppId ? <p>Missing Agora App ID. Live collaboration is disabled until REACT_APP_AGORA_APP_ID is set.</p> : null}
          {!hasConverterUrl ? <p>Missing converter URL. Upload conversion needs REACT_APP_LIBRE_BACKEND_URL.</p> : null}
          {hasConverterUrl && backendHealth.checked && !backendHealth.ok ? <p>Backend health check failed. Confirm the Render/local converter URL and CORS settings.</p> : null}
        </div>
        <div className="home-links">
          <Link className="roadmap-link" to="/workspace-tools">Notes & Reports</Link>
          <Link className="roadmap-link" to="/audit-roadmap">Audit & Reports Roadmap</Link>
        </div>
        </div>
      </div>
      <div className="custom-card">
        <div className="flex-item cover">
            <div className={`cover-placeholder-web ${t('home.cover_class')}`}></div>
        </div>
        <div className="flex-item card">
          <div className="position-content flex-direction-column">
            <FormControl className={classes.formControl}>
              <FormInput Label={t('home.room_name')} value={session.roomName} onChange={
                (val: string) => {
                  setSessionInfo({
                    ...session,
                    roomName: val
                  });
                }}
                requiredText={required.roomName}
              />
            </FormControl>
            <FormControl className={classes.formControl}>
              <FormInput Label={t('home.nickname')} value={session.yourName} onChange={
                (val: string) => {
                  setSessionInfo({
                    ...session,
                    yourName: val
                  });
                }}
                requiredText={required.yourName}
              />
            </FormControl>
            <FormControl className={classes.formControl}>
              <FormInput Label="Designation" value={designation} allowFreeText onChange={(val: string) => setDesignation(val)} />
            </FormControl>
            <div className="profile-color-row">
              <label htmlFor="profileColor">Annotation color</label>
              <input
                id="profileColor"
                type="color"
                value={userColor}
                onChange={(evt: any) => setUserColor(evt.target.value)}
              />
            </div>
            <FormControl className={classes.formControl}>
              <FormSelect
                Label={t('home.room_type')}
                value={session.roomType}
                onChange={(evt: any) => {
                  setSessionInfo({
                    ...session,
                    roomType: evt.target.value
                  });
                }}
                items={roomTypes.map((it: any) => ({
                  value: it.value,
                  text: t(`${it.text}`),
                  path: it.path
                }))}
              />
            </FormControl>
            <FormControl className={classes.formControl}>
              <RoleRadio value={session.role} onChange={(evt: any) => {
                 setSessionInfo({
                   ...session,
                   role: evt.target.value
                 });
              }} requiredText={required.role}></RoleRadio>
            </FormControl>
            <Button name={t('home.room_join')} onClick={handleSubmit}/>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
export default React.memo(HomePage);
