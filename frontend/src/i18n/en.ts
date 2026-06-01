const BUILD_VERSION = process.env.REACT_APP_VERSION as string;
const build_version = BUILD_VERSION ? BUILD_VERSION : '1.0.0';


const en = {
  'return': {
    'home': 'Back To Home',
  },
  'error': {
    'not_found': 'Page Not Found',
    'components': {
      'paramsEmpty': 'params：{reason} can`t be empty',
    }
  },
  'whiteboard': {
    'loading': 'Loading...',
  },
  'toast': {
    'api_login_failured': 'Join failed, reason: {reason}',
    'confirm': 'Confirm',
    'cancel': 'Cancel',
    'quit_room': 'Are you sure you want to exit this workspace?',
    'kick': 'kicked',
    'login_failure': 'login failure',
    'whiteboard_lock': 'Workspace follow enabled',
    'whiteboard_unlock': 'Workspace follow disabled',
    'canceled_screen_share': 'Canceled screen sharing',
    'screen_sharing_failed': 'Screen sharing failed, reason: {reason}',
    'recording_failed': 'Start cloud recording failed, reason: {reason}',
    'start_recording': 'Start cloud recording success',
    'stop_recording': 'Stop cloud recording success',
    'recording_too_short': 'Recording too short, at least 15 seconds',
    'rtm_login_failed': 'login failure, please check your network',
    'rtm_login_failed_reason': '{reason}',
    'replay_failed': 'Replay Failed please refresh browser',
    'teacher_exists': 'A lead reviewer is already present. Wait 30 seconds or open a new workspace.',
    'student_over_limit': 'Reviewer capacity has been reached. Wait 30 seconds or rejoin a new workspace.',
    'teacher_and_student_over_limit': 'The workspace participant limit has been reached.',
    'teacher_accept_whiteboard': 'The lead reviewer granted annotation access',
    'teacher_cancel_whiteboard': 'The lead reviewer removed annotation access',
    'teacher_accept_co_video': 'The lead reviewer accepted co-video',
    'teacher_reject_co_video': 'The lead reviewer rejected co-video',
    'teacher_cancel_co_video': 'The lead reviewer canceled co-video',
    'student_cancel_co_video': 'Reviewer canceled co-video',
    'teacher_already_acpt_whiteboard': 'Annotation access is already granted',
    'add_page': 'New canvas added!',
    'remove_page': 'Current canvas removed!',
    'toggle_page': 'Canvas changed!',
    'upload_file': 'File has been uploaded successfully!',
    'one_allowed_annotation': 'Only one reviewer can annotate at a time',
    'student_not_joined': 'Reviewer has not joined yet',
    'interact_not_allowed': 'You can interact after the lead reviewer joins the workspace',
    'student_joined': 'reviewer joined',
    'student_leave': 'reviewer left',
    'user_joined': 'participant joined',
    'user_leave': 'participant left',
    'raised_hand': 'You have raised hand',
    'cursor_not_allow': 'You can not use cursor on remote annotation'
  },

  'notice': {
    'student_interactive_apply': `"{reason}" requested annotation access`
  },
  'chat': {
    'placeholder': 'Input Message',
    'banned': 'Banned',
    'send': 'send'
  },
  'device': {
    'camera': 'Camera',
    'microphone': 'Microphone',
    'speaker': 'Speaker',
    'finish': 'Finish',
  },
  'nav': {
    'delay': 'Delay: ',
    'network': 'Network: ',
    'cpu': 'CPU: ',
    'class_end': 'End review',
    'class_start': 'Start review',
    'class_ended': 'Review Ended',
    'class_started': 'Review Started'
  },
  'home': {
    'entry-home': 'Join Workspace',
    'teacher': 'Lead reviewer',
    'student': 'Reviewer',
    'cover_class': 'cover-en',
    'room_name': 'Workspace Name',
    'nickname': 'Your Name',
    'room_type': 'Workspace Mode',
    'room_join': 'Join',
    'short_title': {
      'title': 'HexScrum Workspace',
      'subtitle': 'Document Review Suite',
    },
    'name_too_long': 'name too long, should <= 20 characters',
    '1v1': 'Live Workspace',
    'mini_class': 'Meeting Notes',
    'large_class': 'Annotation Report',
    'missing_room_name': 'missing workspace name',
    'missing_your_name': 'missing your name',
    'missing_password': 'missing password',
    'missing_role': 'missing role',
    'account': 'nickname',
    'password': 'password',
  },
  'room': {
    'chat_room': 'Chat Room',
    'student_list': 'Reviewer List',
    'uploading': 'Uploading...',
    'converting': 'Converting...',
    'upload_success': 'upload success',
    'upload_failure': 'upload failure, check the network',
    'convert_success': 'convert success',
    'convert_failure': 'convert failure, check the network',
  },
  'replay': {
    'loading': 'loading...',
  },
  'build_version': `build version: ${build_version}`,
}

export default en;
