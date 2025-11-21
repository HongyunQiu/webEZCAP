#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <libqhy/qhyccd.h>
#include <sys/time.h>

#include <X11/Xlib.h>


#define OPENCV_SUPPORT

#define MAX_CAMERA_NUM	10

#ifdef OPENCV_SUPPORT
#include <opencv/cv.h>
#include <opencv/highgui.h>
#endif

int num = 0;

typedef struct qhyccdhandle
  {
    qhyccd_handle *camhandle;
    char id[32];
    unsigned char *ImgData;
    pthread_t rawhandle;
    int index;
  }
qhyccdhandle;


qhyccdhandle usb_handel[MAX_CAMERA_NUM];


void *pic_thread(void *arg)
{
  int ret;
  int t_start,t_end;
  t_start = time(NULL);
  int fps = 0;
  int found = 0;
  char win_name[20];
  unsigned int w,h,bpp,channels;
  int camtime = 10000,camgain = 0,camspeed = 2,cambinx = 1,cambiny = 1;
  qhyccdhandle *handle = (qhyccdhandle *)arg;
  memset(win_name,0x00,sizeof(win_name));
  //sprintf(win_name,"show%d",handle->index);


  ret = QHYCCD_ERROR;

#if 0
#ifdef OPENCV_SUPPORT

  IplImage *img = NULL;
#endif

  while(1)
    {
      ret = GetQHYCCDLiveFrame(handle->camhandle,&w,&h,&bpp,&channels,handle->ImgData);
      if(ret == QHYCCD_SUCCESS)
        {
#ifdef OPENCV_SUPPORT
          cvNamedWindow(win_name,0);
          if(img == NULL)
            {
              img = cvCreateImageHeader(cvSize(w,h),bpp,1);
              img->imageData = (char *)handle->ImgData;
            }
          cvShowImage(win_name,img);
          cvWaitKey(30);
#endif

          fps++;
          t_end = time(NULL);
          if(t_end - t_start >= 5)
            {
              printf("fps = %d\n",fps / 5);
              fps = 0;
              t_start = time(NULL);
            }
        }
      else
        {
          usleep(5000);
        }

    }
#else

  while(1)
    {
      while(ret == QHYCCD_ERROR)
        {
          ret = GetQHYCCDLiveFrame(handle->camhandle,&w,&h,&bpp,
                                   &channels,handle->ImgData);
          usleep(100000);
        }
#if 1
      IplImage *image;
      cvNamedWindow(win_name,0);
      image = cvCreateImage(cvSize(w,h),bpp,channels);
      image->imageData = (char *)handle->ImgData;
      cvShowImage(win_name,image);
      cvWaitKey(5);
      cvReleaseImage(&image);
#endif

      ret = QHYCCD_ERROR;
      usleep(100000);
    }
#endif

  delete(handle->ImgData);
}

int QHYCCDDinit()
{
  int i;
  int ret;

  for (i = 0;i < num;i ++)
    {
      if(usb_handel[i].camhandle)
        {
          StopQHYCCDLive(usb_handel[i].camhandle);

          ret = CloseQHYCCD(usb_handel[i].camhandle);
          if(ret == QHYCCD_SUCCESS)
            {
              printf("Close QHYCCD success!\n");
            }
          else
            {
              goto QHYCCDDinit_failure;
            }
        }

      ret = ReleaseQHYCCDResource();
      if(ret == QHYCCD_SUCCESS)
        {
          printf("Rlease SDK Resource  success!\n");
        }
      else
        {
          goto QHYCCDDinit_failure;
        }
    }

  return 0;

QHYCCDDinit_failure:
  printf("some fatal error happened\n");
  return 1;
}

int QHYCCDInit()
{
  int ret;

  ret = InitQHYCCDResource();
  if(ret == QHYCCD_SUCCESS)
    {
      printf("Init SDK success!\n");
    }
  else
    {
      goto QHYCCDInit_failure;
    }
  num = ScanQHYCCD();
  if(num > 0)
    {
      printf("Yes!Found QHYCCD,the num is %d \n",num);
    }
  else
    {
      printf("Not Found QHYCCD,please check the usblink or the power\n");
      goto QHYCCDInit_failure;
    }

  for(int i = 0;i < num;i++)
    {
      ret = GetQHYCCDId(i,usb_handel[i].id);
    }

  for(int i = 0;i < num;i++)
    {
      usb_handel[i].camhandle = OpenQHYCCD(usb_handel[i].id);
      usb_handel[i].index = i;
    }

  return 0;

QHYCCDInit_failure:
  printf("some fatal error happened\n");
  return -1;

}


int QHYCCDSet()
{
  int i;
  int ret;
  unsigned int w,h,bpp,channels;
  int cambinx = 1,cambiny = 1;


  for (i = 0;i < num;i ++)
    {
      ret = SetQHYCCDStreamMode(usb_handel[i].camhandle,1);


      ret = InitQHYCCD(usb_handel[i].camhandle);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("Init QHYCCD success!\n");
        }
      else
        {
          printf("Init QHYCCD fail code:%d\n",ret);
          goto QHYCCDSet_failure;
        }

      double chipw,chiph,pixelw,pixelh;
      ret = GetQHYCCDChipInfo(usb_handel[i].camhandle,&chipw,&chiph,&w,&h,&pixelw,&pixelh,&bpp);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("GetQHYCCDChipInfo success!\n");
          printf("CCD/CMOS chip information:\n");
          printf("Chip width %3f mm,Chip height %3f mm\n",chipw,chiph);
          printf("Chip pixel width %3f um,Chip pixel height %3f um\n",pixelw,pixelh);
          printf("Chip Max Resolution is %d x %d,depth is %d\n",w,h,bpp);
        }
      else
        {
          printf("GetQHYCCDChipInfo fail\n");
          goto QHYCCDSet_failure;
        }

      ret = IsQHYCCDControlAvailable(usb_handel[i].camhandle,CONTROL_TRANSFERBIT);
      if(ret == QHYCCD_SUCCESS)
        {
          ret = SetQHYCCDBitsMode(usb_handel[i].camhandle,8);
          if(ret != QHYCCD_SUCCESS)
            {
              printf("SetQHYCCDParam CONTROL_GAIN failed\n");
              getchar();
              return 1;
            }
        }

      ret = SetQHYCCDResolution(usb_handel[i].camhandle,0,0,w,h);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("SetQHYCCDResolution success!\n");
        }
      else
        {
          printf("SetQHYCCDResolution fail\n");
          goto QHYCCDSet_failure;
        }

      ret = SetQHYCCDBinMode(usb_handel[i].camhandle,cambinx,cambiny);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("SetQHYCCDBinMode success!\n");
        }
      else
        {
          printf("SetQHYCCDBinMode fail\n");
          goto QHYCCDSet_failure;
        }

      ret = BeginQHYCCDLive(usb_handel[i].camhandle);
      if(ret == QHYCCD_SUCCESS)
        {
          printf("BeginQHYCCDLive success!\n");
        }
      else
        {
          printf("BeginQHYCCDLive failed\n");
          goto QHYCCDSet_failure;
        }

      int length = GetQHYCCDMemLength(usb_handel[i].camhandle);

      if(length > 0)
        {
          usb_handel[i].ImgData = (unsigned char *)malloc(length);
          memset(usb_handel[i].ImgData,0,length);
        }
      else
        {
          printf("Get the min memory space length failure \n");
          goto QHYCCDSet_failure;
        }

    }

  return 0;

QHYCCDSet_failure:
  printf("some fatal error happened\n");
  return 1;

}

int main(int argc,char *argv[])
{
  int ret;
  int i;


  XInitThreads();


  ret = QHYCCDInit();
  if(QHYCCD_SUCCESS == ret)
    {
      printf("Close QHYCCD success!\n");
    }
  else
    {
      goto MAIN_failure;
    }


  ret = QHYCCDSet();
  if(ret == QHYCCD_SUCCESS)
    {
      printf("Rlease SDK Resource  success!\n");
    }
  else
    {
      goto MAIN_failure;
    }

  for (i = 0;i < num;i ++)
    {
      pthread_create(&usb_handel[i].rawhandle, NULL, pic_thread, &usb_handel[i]);
    }

  while(1)
    {
      sleep(1);
    }

  return 0;

MAIN_failure:
  printf("some fatal error happened\n");
  return 1;
}
